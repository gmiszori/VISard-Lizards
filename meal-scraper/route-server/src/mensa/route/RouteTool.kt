package mensa.route

import kotlinx.serialization.json.*
import java.time.*
import java.net.URLEncoder

private data class Candidate(val stop: MealStop, val point: Point, val data: JsonObject, val cafeteria: Boolean)
private fun coordinates(value: JsonObject) = Point(value["latitude"]!!.jsonPrimitive.double, value["longitude"]!!.jsonPrimitive.double)

class RouteTool(private val maps: MapProvider) {
    fun plan(request: JsonObject): JsonObject {
        val origin = request.text("origin"); val destination = request.text("destination")
        require(origin.isNotBlank() && origin.length <= 200 && destination.isNotBlank() && destination.length <= 200)
        val departure = Instant.parse(request.text("departureTime")); val deadline = Instant.parse(request.text("arrivalTime"))
        val minutes = request["mealMinutes"]!!.jsonPrimitive.int
        require(minutes in 45..60 && departure < deadline && Duration.between(departure, deadline) <= Duration.ofHours(18))
        val today = LocalDate.now(zurich); val date = departure.atZone(zurich).toLocalDate()
        require(date >= today && date <= today.plusDays(6)) { "Plan within the next seven days, for which restaurant hours can be checked." }
        require(date == deadline.atZone(zurich).toLocalDate()) { "Departure and arrival must be on the same Zurich date." }
        require(departure >= Instant.now().minusSeconds(120)) { "Departure cannot be in the past." }
        val baseline = maps.route(origin, destination, departure) ?: error("No walking or public transport route was returned.")
        val path = decodePolyline(baseline.evidence?.text("polyline").orEmpty())
        require(path.isNotEmpty()) { "The route provider returned no route geometry." }
        val maxStops = request["maxStops"]?.jsonPrimitive?.int ?: 8
        require(maxStops in 1..8)
        val warnings = mutableListOf("Best among up to $maxStops checked stops within 1.5 km of the direct route, not a guarantee of a globally optimal route.",
            "Travel times are estimates. A five-minute arrival buffer is included; check live transport disruptions.")
        warnings += baseline.evidence?.array("warnings")?.map { it.jsonPrimitive.content }.orEmpty()
        warnings += "Restaurants with missing or uncertain OpenStreetMap opening hours are omitted."
        val cafeterias = request.array("cafeterias").mapNotNull { element ->
            val data = element.jsonObject
            val point = runCatching { coordinates(data.obj("location")) }.getOrNull() ?: return@mapNotNull null
            val windows = data.array("windows").map { MealWindow(Instant.parse(it.jsonObject.text("open")), Instant.parse(it.jsonObject.text("close"))) }
            if (windows.isEmpty() || data.array("meals").isEmpty()) return@mapNotNull null
            Candidate(MealStop(data.text("id"), data.text("name"), point.toString(), windows), point, data, true)
        }.filter { corridorDistance(it.point, path) <= 1500 }.sortedBy { corridorDistance(it.point, path) }
        val restaurants = mutableListOf<Candidate>()
        val closedPlaces = request.array("closedPlaces").map { it.jsonObject }
        // Discover near the returned path, then verify both legs with the route provider.
        for (index in listOf(0, path.lastIndex / 2, path.lastIndex).distinct()) {
            val places = try { maps.nearby(path[index], date) } catch (ex: Exception) {
                warnings += "Restaurant discovery failed for one route area; only successfully retrieved places are considered."; continue
            }
            for (place in places) {
                val name = place.text("name")
                if (Regex("bellavista|bistro\\s*hpi", RegexOption.IGNORE_CASE).containsMatchIn(name)) continue
                val point = runCatching { coordinates(place.obj("location")) }.getOrNull() ?: continue
                if (closedPlaces.any { closed ->
                    corridorDistance(point, listOf(coordinates(closed))) < 100 && normalized(name).let { a ->
                        val b = normalized(closed.text("name")); a.contains(b) || b.contains(a)
                    }
                }) continue
                val windows = place.array("windows").map { MealWindow(Instant.parse(it.jsonObject.text("open")), Instant.parse(it.jsonObject.text("close"))) }
                if (windows.isEmpty() || corridorDistance(point, path) > 1500) continue
                val data = buildJsonObject {
                    put("id", place.text("id")); put("name", name); put("kind", "restaurant")
                    put("sourceUrl", place.text("sourceUrl")); put("websiteUrl", place.text("websiteUrl"))
                    put("priceLevel", place.text("priceLevel")); put("attributions", place.array("attributions"))
                    put("meals", JsonArray(emptyList())); put("menuNote", "Opening hours checked; kitchen hours, specific dishes and meal prices are not verified. Check the restaurant website.")
                    put("hoursNote", place.text("hoursNote"))
                }
                // Prefer our menu-backed entry when the same venue is returned by OSM.
                val duplicate = cafeterias.any { known ->
                    corridorDistance(point, listOf(known.point)) < 100 && normalized(name).let { a ->
                        val b = normalized(known.stop.name); a.contains(b) || b.contains(a)
                    }
                }
                if (!duplicate) restaurants += Candidate(MealStop(data.text("id"), name, point.toString(), windows), point, data, false)
            }
        }
        val other = restaurants.distinctBy { it.stop.id }.sortedBy { corridorDistance(it.point, path) }
        val half = (maxStops + 1) / 2
        val shortlist = (cafeterias.take(half) + other.take(maxStops - half) + cafeterias.drop(half) + other.drop(maxStops - half)).distinctBy { it.stop.id }.take(maxStops)
        val planner = MealRoutePlanner(RouteProvider { a, b, time ->
            try { maps.route(a, b, time) } catch (ex: Exception) { warnings += "A candidate journey could not be verified and was omitted."; null }
        })
        val journeys = planner.evaluate(origin, destination, departure, deadline, minutes, shortlist.map { it.stop })
        return buildJsonObject {
            put("timeZone", "Europe/Zurich"); put("arrivalDeadline", deadline.toString()); put("mealMinutes", minutes)
            put("baseline", legJson(baseline, origin, destination)); put("checkedStops", shortlist.size)
            put("options", JsonArray(journeys.map { journey -> buildJsonObject {
                val candidate = shortlist.first { it.stop.id == journey.stop.id }
                val place = buildJsonObject {
                    candidate.data.forEach { (key, value) -> put(key, value) }
                    if (candidate.cafeteria) {
                        val services = candidate.data.array("windows").filter { window ->
                            Instant.parse(window.jsonObject.text("open")) <= journey.mealStart && Instant.parse(window.jsonObject.text("close")) >= journey.mealEnd
                        }.map { it.jsonObject.text("service").lowercase() }.toSet()
                        put("meals", JsonArray(candidate.data.array("meals").filter { it.jsonObject.text("service").lowercase() in services }))
                    }
                }
                put("place", place); put("mealStart", journey.mealStart.toString()); put("mealEnd", journey.mealEnd.toString())
                put("arrival", journey.onward.arrival.toString()); put("spareMinutes", journey.spareMinutes)
                put("extraMinutes", Duration.between(baseline.arrival, journey.onward.arrival).toMinutes())
                put("outbound", legJson(journey.outbound, origin, journey.stop.position))
                put("onward", legJson(journey.onward, journey.stop.position, destination))
            } }))
            if (journeys.isEmpty()) warnings += "No checked stop fits a full meal break, published hours and the arrival deadline. Try departing earlier or changing the arrival time."
            put("warnings", JsonArray(warnings.distinct().map { JsonPrimitive(it) })); put("attribution", "© OpenStreetMap contributors · Walking routes: FOSSGIS/OSRM · Timetables: transport.opendata.ch")
        }
    }
}
private fun normalized(name: String) = name.lowercase().replace(Regex("[^a-z0-9]"), "")
fun legJson(leg: RouteLeg, origin: String, destination: String) = buildJsonObject {
    put("departure", leg.departure.toString()); put("arrival", leg.arrival.toString()); put("distanceMetres", leg.distanceMetres)
    put("directions", JsonArray(leg.directions.map { JsonPrimitive(it) })); put("provider", leg.evidence ?: buildJsonObject {})
    val from = leg.evidence?.text("originCoordinates")?.ifBlank { origin } ?: origin
    val to = leg.evidence?.text("destinationCoordinates")?.ifBlank { destination } ?: destination
    put("mapsUrl", if (leg.evidence?.text("mode") == "TRANSIT") "https://transport.opendata.ch/" else "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${URLEncoder.encode("$from;$to", Charsets.UTF_8)}")
}
