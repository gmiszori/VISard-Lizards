package mensa.route

import kotlinx.serialization.json.*
import java.net.URI
import java.net.http.*
import java.time.*

class OpenRouteException(val code: String, message: String) : IllegalStateException(message)
/** Kotlin MCP remains the authority; the private JS adapter uses osm-api-js read-only. */
class OpenStreetMaps : MapProvider {
    fun locations(query: String): JsonObject {
        require(query.length in 3..200) { "Enter between 3 and 200 characters." }
        return post("/locations", buildJsonObject { put("query", query) })
    }
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val base = (System.getenv("OSM_DATA_URL") ?: "http://127.0.0.1:8093").trimEnd('/')
    private val token = System.getenv("ROUTE_CONNECTOR_TOKEN").orEmpty()
    private val cache = mutableMapOf<Triple<String, String, Instant>, List<RouteLeg>>()
    private fun post(path: String, data: JsonObject): JsonObject {
        val request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(65))
            .header("Authorization", "Bearer $token").header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(data.toString())).build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) {
            val code = runCatching { json.parseToJsonElement(response.body()).jsonObject.text("code") }.getOrDefault("")
            throw OpenRouteException(if (code in listOf("route_provider_busy", "invalid_location")) code else "route_provider_failed",
                "OpenStreetMap or Swiss transport lookup failed. Check locations and provider availability.")
        }
        return json.parseToJsonElement(response.body()).jsonObject
    }
    override fun options(origin: String, destination: String, departure: Instant): List<RouteLeg> =
        cache.getOrPut(Triple(origin, destination, departure)) {
            post("/options", buildJsonObject { put("origin", origin); put("destination", destination); put("departureTime", departure.toString()) })
                .array("routes").map { parseOpenLeg(it.jsonObject, departure) }.sortedBy { it.arrival }
        }
    override fun route(origin: String, destination: String, departure: Instant) = options(origin, destination, departure).firstOrNull()
    override fun nearby(point: Point): List<JsonObject> = nearby(point, LocalDate.now(zurich))
    override fun walkingCosts(origin: Point, destination: Point, stops: List<Point>): List<Double?> =
        post("/matrix", buildJsonObject {
            fun pointJson(point: Point) = buildJsonArray { add(point.lat); add(point.lng) }
            put("origin", pointJson(origin)); put("destination", pointJson(destination))
            put("stops", JsonArray(stops.map { pointJson(it) }))
        }).array("costs").map { (it as? JsonPrimitive)?.doubleOrNull?.takeIf { value -> value.isFinite() && value >= 0 } }
    override fun nearby(point: Point, date: LocalDate): List<JsonObject> = post("/nearby", buildJsonObject {
        put("latitude", point.lat); put("longitude", point.lng); put("date", date.toString())
    }).array("places").map { it.jsonObject }
}
fun parseOpenLeg(value: JsonObject, earliest: Instant): RouteLeg {
    val departure = Instant.parse(value.text("departure")); val arrival = Instant.parse(value.text("arrival"))
    val evidence = value.obj("provider")
    require(departure >= earliest && arrival >= departure && evidence.text("mode") in listOf("WALK", "TRANSIT"))
    require(decodePolyline(evidence.text("polyline")).isNotEmpty()) { "Missing provider route geometry." }
    require(value["distanceMetres"]!!.jsonPrimitive.int >= 0)
    return RouteLeg(departure, arrival, value["distanceMetres"]!!.jsonPrimitive.int,
        value.array("directions").map { it.jsonPrimitive.content }, evidence)
}
