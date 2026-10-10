package mensa.route

import java.time.Duration
import java.time.Instant

/** The routing provider must return actual scheduled arrivals, including waiting and walking. */
data class RouteLeg(val departure: Instant, val arrival: Instant, val distanceMetres: Int, val directions: List<String>,
                    val evidence: kotlinx.serialization.json.JsonObject? = null)
fun interface RouteProvider {
    fun route(origin: String, destination: String, departure: Instant): RouteLeg?
}
data class MealWindow(val open: Instant, val close: Instant)
data class MealStop(val id: String, val name: String, val position: String, val windows: List<MealWindow>)
data class MealJourney(
    val stop: MealStop, val outbound: RouteLeg, val mealStart: Instant,
    val mealEnd: Instant, val onward: RouteLeg, val spareMinutes: Long,
)

/** Schedules a complete meal inside a published service window, then verifies the onward journey. */
class MealRoutePlanner(private val routes: RouteProvider) {
    fun evaluate(origin: String, destination: String, departure: Instant, deadline: Instant,
                 mealMinutes: Int, stops: List<MealStop>): List<MealJourney> {
        require(mealMinutes in 45..60) { "The meal break must be 45–60 minutes." }
        require(departure < deadline) { "Departure must be before the arrival deadline." }
        require(stops.size <= 8) { "At most eight shortlisted stops can be checked." }
        val buffer = Duration.ofMinutes(5)
        return stops.distinctBy { it.id }.mapNotNull { stop ->
            val outbound = routes.route(origin, stop.position, departure) ?: return@mapNotNull null
            require(outbound.departure >= departure && outbound.arrival >= outbound.departure) { "Invalid routing timetable." }
            stop.windows.sortedBy { it.open }.firstNotNullOfOrNull { window ->
                val mealStart = maxOf(outbound.arrival, window.open)
                val mealEnd = mealStart.plus(Duration.ofMinutes(mealMinutes.toLong()))
                if (mealEnd > window.close || mealEnd.plus(buffer) > deadline) return@firstNotNullOfOrNull null
                val onward = routes.route(stop.position, destination, mealEnd) ?: return@firstNotNullOfOrNull null
                require(onward.departure >= mealEnd && onward.arrival >= onward.departure) { "Invalid routing timetable." }
                if (onward.arrival.plus(buffer) > deadline) return@firstNotNullOfOrNull null
                MealJourney(stop, outbound, mealStart, mealEnd, onward, Duration.between(onward.arrival, deadline).toMinutes())
            }
        }.sortedWith(compareBy<MealJourney> { it.onward.arrival }
            .thenBy { Duration.between(it.outbound.departure, it.outbound.arrival).plus(Duration.between(it.onward.departure, it.onward.arrival)) }
            .thenBy { it.stop.name })
    }
}
