package mensa.route

import kotlinx.serialization.json.*
import java.time.*
import kotlin.math.*

val json = Json { ignoreUnknownKeys = true }
val zurich: ZoneId = ZoneId.of("Europe/Zurich")
fun JsonObject.text(key: String) = (get(key) as? JsonPrimitive)?.contentOrNull.orEmpty()
fun JsonObject.obj(key: String) = get(key) as? JsonObject ?: buildJsonObject {}
fun JsonObject.array(key: String) = get(key) as? JsonArray ?: JsonArray(emptyList())
fun number(value: Double) = JsonPrimitive(value)

data class Point(val lat: Double, val lng: Double) {
    init { require(lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0) }
    override fun toString() = "$lat,$lng"
}

/** Provider contract shared by Kotlin routing and the private OSM data adapter. */
interface MapProvider : RouteProvider {
    fun withModes(modes: List<String>): MapProvider = this
    fun options(origin: String, destination: String, departure: Instant): List<RouteLeg>
    fun nearby(point: Point): List<JsonObject>
    fun nearby(point: Point, date: LocalDate): List<JsonObject> = nearby(point)
    fun nearby(point: Point, date: LocalDate, quickMeal: Boolean): List<JsonObject> = nearby(point,date)
    fun walkingCosts(origin: Point, destination: Point, stops: List<Point>): List<Double?> = stops.map { null }
    fun walkingDistances(origin: Point, destination: Point, stops: List<Point>): List<Double?> = stops.map { null }
}
fun travelModes(request: JsonObject): List<String> {
    val modes = if (request["modes"] == null) listOf("WALK", "TRANSIT") else request.array("modes").map { it.jsonPrimitive.content }
    require(modes.isNotEmpty() && modes.size <= 2 && modes.all { it in listOf("WALK", "TRANSIT") }) { "Select walking or public transport." }
    return modes.distinct().sorted()
}
fun decodePolyline(encoded: String): List<Point> {
    val points = mutableListOf<Point>(); var index = 0; var lat = 0; var lng = 0
    fun delta(): Int {
        var result = 0; var shift = 0; var part: Int
        do { require(index < encoded.length && shift < 32); part = encoded[index++].code - 63; result = result or ((part and 31) shl shift); shift += 5 } while (part >= 32)
        return if (result and 1 != 0) (result shr 1).inv() else result shr 1
    }
    while (index < encoded.length) { lat += delta(); lng += delta(); points += Point(lat / 1e5, lng / 1e5) }
    return points
}
/** Distance to line segments, not just sparse polyline vertices (metres, local Zurich projection). */
fun corridorDistance(point: Point, path: List<Point>): Double {
    if (path.isEmpty()) return Double.POSITIVE_INFINITY
    fun xy(p: Point) = Pair((p.lng - point.lng) * 111_320 * cos(Math.toRadians(point.lat)), (p.lat - point.lat) * 111_320)
    if (path.size == 1) return xy(path.single()).let { hypot(it.first, it.second) }
    return path.zipWithNext().minOf { (a, b) ->
        val (ax, ay) = xy(a); val (bx, by) = xy(b); val dx = bx - ax; val dy = by - ay
        val t = if (dx * dx + dy * dy == 0.0) 0.0 else (-(ax * dx + ay * dy) / (dx * dx + dy * dy)).coerceIn(0.0, 1.0)
        hypot(ax + t * dx, ay + t * dy)
    }
}
