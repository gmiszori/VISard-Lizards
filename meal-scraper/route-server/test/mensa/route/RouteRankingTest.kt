package mensa.route

import java.time.*
import kotlinx.serialization.json.*
import kotlin.test.*

class RouteRankingTest {
    @Test fun matrixRanksStopsBeforeBothLegsAreVerifiedAndFailureFallsBack() {
        val departure = LocalDate.now(zurich).plusDays(1).atTime(11, 0).atZone(zurich).toInstant()
        var matrixCalls = 0
        var unavailable = false
        val maps = object : MapProvider {
            override fun options(origin: String, destination: String, departure: Instant) = listOf(route(origin, destination, departure))
            override fun route(origin: String, destination: String, departure: Instant) = RouteLeg(departure, departure.plusSeconds(600), 1000, emptyList(), buildJsonObject {
                put("mode", "WALK"); put("polyline", "_p~iF~ps|U_ulLnnqC_mqNvxq`@")
            })
            override fun nearby(point: Point) = emptyList<JsonObject>()
            override fun walkingCosts(origin: Point, destination: Point, stops: List<Point>): List<Double?> {
                matrixCalls++
                if(unavailable) error("Matrix busy")
                return stops.map { if(it.lat == 38.502) 100.0 else 900.0 }
            }
        }
        fun cafeteria(id: String, lat: Double) = buildJsonObject {
            put("id", id); put("name", id)
            put("location", buildJsonObject { put("latitude", lat); put("longitude", -120.2) })
            put("windows", buildJsonArray { add(buildJsonObject {
                put("open", departure.toString()); put("close", departure.plusSeconds(14400).toString()); put("service", "lunch")
            }) })
            put("meals", buildJsonArray { add(buildJsonObject { put("service", "lunch"); put("title", "Pasta") }) })
        }
        val request = buildJsonObject {
            put("origin", "A"); put("destination", "B"); put("departureTime", departure.toString())
            put("arrivalTime", departure.plusSeconds(14400).toString()); put("mealMinutes", 60); put("maxStops", 1)
            put("cafeterias", buildJsonArray { add(cafeteria("nearer", 38.501)); add(cafeteria("faster", 38.502)) })
        }
        val ranked = RouteTool(maps).plan(request)
        assertEquals("faster", ranked.array("options").first().jsonObject.obj("place").text("id"))
        assertEquals(1, matrixCalls)
        unavailable = true
        val fallback = RouteTool(maps).plan(request)
        assertEquals("nearer", fallback.array("options").first().jsonObject.obj("place").text("id"))
        assertTrue(fallback.array("warnings").any { it.jsonPrimitive.content.contains("matrix unavailable") })
    }
}
