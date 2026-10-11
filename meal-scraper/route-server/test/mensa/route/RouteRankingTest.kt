package mensa.route

import java.time.*
import kotlinx.serialization.json.*
import kotlin.test.*

class RouteRankingTest {
    @Test fun distanceComesBeforeDishCountAndShortBreakFlagReachesDiscovery() {
        val departure=LocalDate.now(zurich).plusDays(1).atTime(11,0).atZone(zurich).toInstant()
        var quick=false
        val maps=object: MapProvider {
            override fun options(origin:String,destination:String,departure:Instant)=listOf(route(origin,destination,departure))
            override fun route(origin:String,destination:String,departure:Instant)=RouteLeg(departure,departure.plusSeconds(60),
                if(origin.contains("38.501") || destination.contains("38.501")) 550 else 1000,emptyList(),buildJsonObject { put("mode","WALK");put("polyline","_p~iF~ps|U_ulLnnqC_mqNvxq`@") })
            override fun nearby(point:Point)=emptyList<JsonObject>()
            override fun nearby(point:Point,date:LocalDate,quickMeal:Boolean):List<JsonObject> { quick=quickMeal;return emptyList() }
            override fun walkingDistances(origin:Point,destination:Point,stops:List<Point>)=stops.map { if(it.lat==38.501) 100.0 else 1000.0 }
        }
        fun place(id:String,lat:Double,count:Int)=buildJsonObject {
            put("id",id);put("name",id);put("location",buildJsonObject { put("latitude",lat);put("longitude",-120.2) })
            put("windows",buildJsonArray { add(buildJsonObject { put("open",departure.toString());put("close",departure.plusSeconds(14400).toString());put("service","lunch") }) })
            put("meals",JsonArray((1..count).map { buildJsonObject { put("title","Dish $it");put("service","lunch") } }))
        }
        fun request(maximum:Int,extra:Boolean=false)=buildJsonObject {
            put("origin","A");put("destination","B");put("departureTime",departure.toString());put("arrivalTime",departure.plusSeconds(14400).toString())
            put("mealMinutes",5);put("mealMaxMinutes",maximum);put("maxStops",if(extra) 5 else 3)
            put("cafeterias",buildJsonArray { add(place("far-full",38.502,10));add(place("near-few",38.501,1));add(place("near-full",38.501,3));if(extra) { add(place("fourth",38.501,2));add(place("fifth",38.501,2)) } })
        }
        val options=RouteTool(maps).plan(request(15)).array("options")
        assertTrue(quick);assertEquals(listOf("near-full","near-few","far-full"),options.map { it.jsonObject.obj("place").text("id") })
        assertEquals(100,options.first().jsonObject["additionalDistanceMetres"]!!.jsonPrimitive.int)
        assertEquals(5,RouteTool(maps).plan(request(20,true)).array("options").size);assertFalse(quick)
    }
    @Test fun matrixRanksStopsBeforeBothLegsAreVerifiedAndFailureFallsBack() {
        val departure = LocalDate.now(zurich).plusDays(1).atTime(11, 0).atZone(zurich).toInstant()
        var matrixCalls = 0
        var unavailable = false
        var firstStopFails = false
        val maps = object : MapProvider {
            override fun options(origin: String, destination: String, departure: Instant) = listOfNotNull(route(origin, destination, departure))
            override fun route(origin: String, destination: String, departure: Instant):RouteLeg? {
                if(firstStopFails && (origin.contains("38.502") || destination.contains("38.502"))) return null
                return RouteLeg(departure, departure.plusSeconds(600), 1000, emptyList(), buildJsonObject {
                put("mode", "WALK"); put("polyline", "_p~iF~ps|U_ulLnnqC_mqNvxq`@")
            }) }
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
        firstStopFails=true
        val retry=RouteTool(maps).plan(request)
        assertEquals("nearer",retry.array("options").first().jsonObject.obj("place").text("id"))
        assertEquals(2,retry["checkedStops"]!!.jsonPrimitive.int)
        firstStopFails=false
        unavailable = true
        val fallback = RouteTool(maps).plan(request)
        assertEquals("nearer", fallback.array("options").first().jsonObject.obj("place").text("id"))
        assertTrue(fallback.array("warnings").any { it.jsonPrimitive.content.contains("matrix unavailable") })
    }
}
