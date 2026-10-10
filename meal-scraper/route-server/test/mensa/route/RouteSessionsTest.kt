package mensa.route

import java.time.*
import kotlinx.serialization.json.*
import kotlin.test.*

class RouteSessionsTest {
    @Test fun sessionRequiresOrderedToolsAndSelectsOnlyStoredGeometry() {
        var routeCalls = 0
        var nearbyCalls = 0
        val departure = LocalDate.now(zurich).plusDays(1).atTime(11, 0).atZone(zurich).toInstant()
        val leg = RouteLeg(departure, departure.plusSeconds(600), 1000, listOf("Walk"), buildJsonObject {
            put("mode", "WALK"); put("polyline", "_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        })
        val maps = object : MapProvider {
            override fun options(origin: String, destination: String, departure: Instant) = listOf(leg).also { routeCalls++ }
            override fun route(origin: String, destination: String, departure: Instant) = leg
            override fun nearby(point: Point) = emptyList<JsonObject>().also { nearbyCalls++ }
        }
        val sessions = RouteSessions({ maps })
        val request = buildJsonObject {
            put("origin", "A"); put("destination", "B"); put("departureTime", departure.toString())
            put("arrivalTime", departure.plusSeconds(10800).toString()); put("mealMinutes", 60)
            put("cafeterias", JsonArray(emptyList()))
        }
        val id = sessions.routes(request).text("sessionId")
        assertFailsWith<IllegalStateException> { sessions.show(id, -1) }
        val plan = sessions.stops(id, 2)
        val discoveryCalls = nearbyCalls
        assertEquals(plan, sessions.stops(id, 2), "repeated discovery does not repeat provider calls")
        assertEquals(discoveryCalls, nearbyCalls)
        assertFailsWith<IllegalArgumentException> { sessions.show(id, 99) }
        val selected = sessions.show(id, -1)
        assertEquals(-1, selected["selectedOptionIndex"]!!.jsonPrimitive.int)
        assertEquals(leg.evidence, selected.obj("baseline").obj("provider"))
        assertEquals(1, routeCalls)
        assertFailsWith<IllegalStateException> { sessions.show(id, -1) }
    }
}
