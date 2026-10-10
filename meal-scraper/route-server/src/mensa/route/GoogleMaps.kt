package mensa.route

import kotlinx.serialization.json.*
import java.net.URI
import java.net.http.*
import java.time.*
import kotlin.math.*

val json = Json { ignoreUnknownKeys = true }
val zurich: ZoneId = ZoneId.of("Europe/Zurich")
fun JsonObject.text(key: String) = (get(key) as? JsonPrimitive)?.contentOrNull.orEmpty()
fun JsonObject.obj(key: String) = get(key) as? JsonObject ?: buildJsonObject {}
fun JsonObject.array(key: String) = get(key) as? JsonArray ?: JsonArray(emptyList())
fun number(value: Double) = JsonPrimitive(value)

class GoogleProviderException(val code: String, message: String) : IllegalStateException(message)
/** Classify provider failures without forwarding raw provider payloads or credentials. */
fun googleFailure(status: Int, body: String, routes: Boolean): GoogleProviderException {
    val daily = runCatching {
        json.parseToJsonElement(body).jsonObject.obj("error").array("details").any {
            it.jsonObject.obj("metadata").text("quota_limit").contains("PerDay", ignoreCase = true)
        }
    }.getOrDefault(false)
    return when {
        status == 429 && routes && daily -> GoogleProviderException("google_routes_daily_quota",
            "Google Routes daily request quota is exhausted. Increase the daily quota in Google Cloud or wait for its reset.")
        status == 429 -> GoogleProviderException("google_quota",
            "Google Maps request quota is exhausted. Check Google Cloud quotas before retrying.")
        else -> GoogleProviderException("google_request_failed",
            "Google Maps request failed (HTTP $status); check enabled APIs, billing and key restrictions.")
    }
}
data class Point(val lat: Double, val lng: Double) {
    init { require(lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0) }
    override fun toString() = "$lat,$lng"
}
fun seconds(value: String): Duration = Duration.ofNanos((value.removeSuffix("s").toDouble() * 1e9).toLong())

/** Fixed HTTPS destinations; credentials are headers, never URLs, logs or tool output. */
interface MapProvider : RouteProvider {
    fun options(origin: String, destination: String, departure: Instant): List<RouteLeg>
    fun nearby(point: Point): List<JsonObject>
}
class GoogleMaps(private val key: String) : MapProvider {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val expires = System.nanoTime() + Duration.ofSeconds(140).toNanos()
    private var calls = 0
    private val cache = mutableMapOf<Triple<String, String, Instant>, List<RouteLeg>>()
    fun post(endpoint: String, mask: String, body: JsonObject): JsonObject {
        val remaining = Duration.ofNanos(expires - System.nanoTime())
        check(!remaining.isNegative && remaining.seconds >= 1 && ++calls <= 40) { "Routing request budget reached." }
        val request = HttpRequest.newBuilder(URI.create(endpoint)).timeout(minOf(Duration.ofSeconds(20), remaining))
            .header("Content-Type", "application/json").header("X-Goog-Api-Key", key)
            .header("X-Goog-FieldMask", mask).POST(HttpRequest.BodyPublishers.ofString(body.toString())).build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299)
            throw googleFailure(response.statusCode(), response.body(), endpoint.startsWith("https://routes.googleapis.com/"))
        return json.parseToJsonElement(response.body()).jsonObject
    }
    override fun route(origin: String, destination: String, departure: Instant): RouteLeg? =
        options(origin, destination, departure).minByOrNull { it.arrival }
    override fun options(origin: String, destination: String, departure: Instant): List<RouteLeg> =
        cache.getOrPut(Triple(origin, destination, departure)) {
            listOf("TRANSIT", "WALK").flatMap { mode ->
                val response = post("https://routes.googleapis.com/directions/v2:computeRoutes",
                    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.legs.startLocation,routes.legs.endLocation,routes.warnings",
                    buildJsonObject {
                        put("origin", waypoint(origin)); put("destination", waypoint(destination)); put("travelMode", mode)
                        put("languageCode", "en"); put("regionCode", "CH")
                        if (mode == "TRANSIT") { put("departureTime", departure.toString()); put("computeAlternativeRoutes", true) }
                    })
                response.array("routes").mapNotNull { scheduledLeg(it.jsonObject, departure, mode) }
            }.sortedBy { it.arrival }
        }
    private fun waypoint(value: String): JsonObject {
        val pair = value.split(',').map { it.trim().toDoubleOrNull() }
        return buildJsonObject {
            if (pair.size == 2 && pair.all { it != null }) {
                val point = Point(pair[0]!!, pair[1]!!)
                putJsonObject("location") { putJsonObject("latLng") { put("latitude", point.lat); put("longitude", point.lng) } }
            } else put("address", value)
        }
    }
    override fun nearby(point: Point): List<JsonObject> = post("https://places.googleapis.com/v1/places:searchNearby",
        "places.id,places.displayName,places.location,places.googleMapsUri,places.websiteUri,places.currentOpeningHours,places.regularOpeningHours,places.businessStatus,places.priceLevel,places.attributions",
        buildJsonObject {
            put("includedTypes", JsonArray(listOf(JsonPrimitive("restaurant"), JsonPrimitive("cafe"))))
            put("maxResultCount", 8); put("rankPreference", "DISTANCE"); put("languageCode", "en")
            putJsonObject("locationRestriction") { putJsonObject("circle") {
                putJsonObject("center") { put("latitude", point.lat); put("longitude", point.lng) }; put("radius", 800)
            } }
        }).array("places").map { it.jsonObject }
}

/** Resolve transit clock times explicitly; route durations alone omit important timetable context. */
fun scheduledLeg(route: JsonObject, start: Instant, mode: String): RouteLeg? {
    var cursor = start
    val directions = mutableListOf<String>()
    val steps = route.array("legs").flatMap { it.jsonObject.array("steps") }
    if (steps.isEmpty()) return null
    for (element in steps) {
        val step = element.jsonObject
        val transit = step.obj("transitDetails")
        if (transit.isNotEmpty()) {
            val stops = transit.obj("stopDetails")
            val departure = runCatching { Instant.parse(stops.text("departureTime")) }.getOrNull() ?: return null
            val arrival = runCatching { Instant.parse(stops.text("arrivalTime")) }.getOrNull() ?: return null
            if (departure < cursor || arrival < departure) return null
            cursor = arrival
            val line = transit.obj("transitLine")
            directions += "${departure.atZone(zurich).toLocalTime()}: ${line.text("nameShort").ifBlank { line.text("name") }} from ${stops.obj("departureStop").text("name")} to ${stops.obj("arrivalStop").text("name")} (${arrival.atZone(zurich).toLocalTime()})"
        } else {
            val duration = runCatching { seconds(step.text("staticDuration")) }.getOrNull() ?: return null
            cursor = cursor.plus(duration)
            directions += step.obj("navigationInstruction").text("instructions").ifBlank { "Walk for ${duration.toMinutes()} minutes" }
        }
    }
    return RouteLeg(start, cursor, route["distanceMeters"]?.jsonPrimitive?.intOrNull ?: 0, directions,
        buildJsonObject { put("mode", mode); put("polyline", route.obj("polyline").text("encodedPolyline")); put("warnings", route.array("warnings")) })
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

fun placeWindows(place: JsonObject, date: LocalDate): List<MealWindow> {
    val current = place["currentOpeningHours"] as? JsonObject
    val hours = current ?: place.obj("regularOpeningHours")
    fun time(value: JsonObject, base: LocalDate): Instant? {
        val explicit = value.obj("date")
        val day = if (explicit.isNotEmpty()) runCatching { LocalDate.of(explicit["year"]!!.jsonPrimitive.int, explicit["month"]!!.jsonPrimitive.int, explicit["day"]!!.jsonPrimitive.int) }.getOrNull()
            else base.plusDays(((value["day"]?.jsonPrimitive?.intOrNull ?: return null) - base.dayOfWeek.value % 7 + 7).toLong() % 7)
        return day?.atTime(value["hour"]?.jsonPrimitive?.intOrNull ?: 0, value["minute"]?.jsonPrimitive?.intOrNull ?: 0)?.atZone(zurich)?.toInstant()
    }
    return hours.array("periods").mapNotNull { element ->
        val period = element.jsonObject; val open = period.obj("open"); val close = period.obj("close")
        if (close.isEmpty() && open["day"]?.jsonPrimitive?.intOrNull == 0 && open["hour"]?.jsonPrimitive?.intOrNull == 0)
            return@mapNotNull MealWindow(date.atStartOfDay(zurich).toInstant(), date.plusDays(1).atStartOfDay(zurich).toInstant())
        val opening = time(open, date.minusDays(1)) ?: return@mapNotNull null
        val closing = time(close, opening.atZone(zurich).toLocalDate()) ?: return@mapNotNull null
        val end = if (closing <= opening) closing.plus(Duration.ofDays(7)) else closing
        val startOfDay = date.atStartOfDay(zurich).toInstant(); val endOfDay = date.plusDays(1).atStartOfDay(zurich).toInstant()
        if (opening < endOfDay && end > startOfDay) MealWindow(maxOf(opening, startOfDay), minOf(end, endOfDay)) else null
    }
}
