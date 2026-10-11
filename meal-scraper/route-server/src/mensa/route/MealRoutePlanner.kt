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
                 mealMinutes: Int, stops: List<MealStop>, mealMaxMinutes: Int = mealMinutes): List<MealJourney> {
        require(mealMinutes in 5..120 && mealMaxMinutes in mealMinutes..120) { "The meal range must be within 5–120 minutes, minimum first." }
        require(departure < deadline) { "Departure must be before the arrival deadline." }
        require(stops.size <= 8) { "At most eight shortlisted stops can be checked." }
        val buffer = Duration.ofMinutes(5)
        return stops.distinctBy { it.id }.mapNotNull { stop ->
            val outbound = routes.route(origin, stop.position, departure) ?: return@mapNotNull null
            require(outbound.departure >= departure && outbound.arrival >= outbound.departure) { "Invalid routing timetable." }
            stop.windows.sortedBy { it.open }.firstNotNullOfOrNull { window ->
                val mealStart = maxOf(outbound.arrival, window.open)
                fun check(minutes: Int): MealJourney? {
                    val mealEnd = mealStart.plus(Duration.ofMinutes(minutes.toLong()))
                    if (mealEnd > window.close || mealEnd.plus(buffer) > deadline) return null
                    val onward = routes.route(stop.position, destination, mealEnd) ?: return null
                    require(onward.departure >= mealEnd && onward.arrival >= onward.departure) { "Invalid routing timetable." }
                    if (onward.arrival.plus(buffer) > deadline) return null
                    return MealJourney(stop, outbound, mealStart, mealEnd, onward, Duration.between(onward.arrival, deadline).toMinutes())
                }
                var best = check(mealMinutes) ?: return@firstNotNullOfOrNull null
                if (mealMaxMinutes == mealMinutes) return@firstNotNullOfOrNull best
                val upper = minOf(mealMaxMinutes, Duration.between(mealStart, minOf(window.close, deadline.minus(buffer))).toMinutes().toInt())
                if (upper <= mealMinutes) return@firstNotNullOfOrNull best
                check(upper)?.let { return@firstNotNullOfOrNull it }
                // Earliest-arrival routing permits waiting, so feasibility decreases with a later departure.
                // Check five-minute increments using a bounded binary search, preserving the minimum.
                var low = 1; var high = (upper - mealMinutes - 1) / 5
                while (low <= high) {
                    val mid = (low + high) / 2
                    val candidate = check(mealMinutes + mid * 5)
                    if (candidate != null) { best = candidate; low = mid + 1 } else high = mid - 1
                }
                best
            }
        }.sortedWith(compareBy<MealJourney> { it.onward.arrival }
            .thenBy { Duration.between(it.outbound.departure, it.outbound.arrival).plus(Duration.between(it.onward.departure, it.onward.arrival)) }
            .thenBy { it.stop.name })
    }
}
