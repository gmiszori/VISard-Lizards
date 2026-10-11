package mensa.route

import java.time.*
import java.util.UUID
import kotlinx.serialization.json.*

/** Short-lived state keeps authoritative inputs and provider geometry outside model control. */
class RouteSessions(private val provider: () -> MapProvider, private val clock: Clock = Clock.systemUTC()) {
    private data class Session(val request: JsonObject, val maps: MapProvider, val routes: List<RouteLeg>, val expires: Instant, var plan: JsonObject? = null)
    private val sessions = mutableMapOf<String, Session>()
    @Synchronized fun routes(request: JsonObject): JsonObject {
        val now = clock.instant()
        sessions.entries.removeIf { it.value.expires < now }
        require(sessions.size < 16) { "Too many unfinished route sessions; retry shortly." }
        val origin = request.text("origin"); val destination = request.text("destination")
        val departure = Instant.parse(request.text("departureTime")); val arrival = Instant.parse(request.text("arrivalTime"))
        val date = departure.atZone(zurich).toLocalDate(); val today = now.atZone(zurich).toLocalDate()
        require(origin.isNotBlank() && origin.length <= 200 && destination.isNotBlank() && destination.length <= 200)
        require(departure >= now.minusSeconds(120) && departure < arrival && Duration.between(departure, arrival) <= Duration.ofHours(18))
        require(date >= today && date <= today.plusDays(6) && date == arrival.atZone(zurich).toLocalDate())
        val minimum = request["mealMinutes"]!!.jsonPrimitive.int
        val maximum = request["mealMaxMinutes"]?.jsonPrimitive?.int ?: minimum
        require(minimum in 5..120 && maximum in minimum..120)
        val maps = provider().withModes(travelModes(request)); val routes = maps.options(origin, destination, departure)
        require(routes.isNotEmpty()) { "No walking or transit route was returned." }
        val id = UUID.randomUUID().toString()
        sessions[id] = Session(request, maps, routes, now.plusSeconds(180))
        return buildJsonObject {
            put("sessionId", id); put("timeZone", "Europe/Zurich")
            put("routes", JsonArray(routes.map { legJson(it, origin, destination) }))
            put("nextTool", "find_meal_stops")
        }
    }
    private fun session(id: String): Session {
        val value = sessions[id] ?: error("Unknown route session. Retrieve route options first.")
        if (value.expires < clock.instant()) { sessions.remove(id); error("Route session expired. Start a new plan.") }
        return value
    }
    @Synchronized fun stops(id: String, maxStops: Int): JsonObject {
        require(maxStops in 1..4) { "Check one to four meal stops." }
        val session = session(id)
        session.plan?.let { return it }
        val request = buildJsonObject { session.request.forEach { (key, value) -> put(key, value) }; put("maxStops", maxStops) }
        val plan = RouteTool(session.maps).plan(request)
        return buildJsonObject {
            plan.forEach { (key, value) -> put(key, value) }
            put("directRoutes", JsonArray(session.routes.map { legJson(it, request.text("origin"), request.text("destination")) }))
        }.also { session.plan = it }
    }
    @Synchronized fun show(id: String, index: Int): JsonObject {
        val plan = session(id).plan ?: error("Find and verify meal stops before selecting a route.")
        require(index == -1 || index in plan.array("options").indices) { "Select an existing verified option; -1 selects the direct route." }
        sessions.remove(id)
        return buildJsonObject { plan.forEach { (key, value) -> put(key, value) }; put("selectedOptionIndex", index) }
    }
}
