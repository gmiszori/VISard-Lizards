package mensa

import kotlinx.serialization.json.*
import org.jsoup.nodes.Document
import java.net.URI
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId
import java.time.DayOfWeek
import java.time.temporal.TemporalAdjusters

/** Read public page data as JSON, never execute the website's JavaScript. */
object CampusMenus {
    private fun JsonElement?.obj() = this as? JsonObject
    private fun JsonElement?.text() = (this as? JsonPrimitive)?.contentOrNull
    private fun JsonObject.array(key: String) = this[key] as? JsonArray ?: JsonArray(emptyList())
    private fun meal(source: SourceDocument, itemKey: String, name: String, description: String?, section: String?,
                     date: String?, start: String? = null, end: String? = null, diets: List<String> = emptyList(),
                     prices: List<MealPrice> = emptyList(), allergens: List<String> = emptyList(), evidence: String, method: String): Meal {
        val uri = URI(source.url)
        val identitySource = if (uri.host == "app.food2050.ch") uri.host + uri.path.split('/').take(5).joinToString("/") else source.url
        val key = if (uri.host == "app.food2050.ch") "$identitySource|$itemKey|$date" else "$identitySource|$itemKey|$date|$start|$end|$section"
        val id = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).take(10).joinToString("") { "%02x".format(it) }
        return Meal(id, MenuExtractor.clean(name), description, prices.firstOrNull(), section, diets, source.url, null,
            evidence, method, date, start, end, prices, allergens)
    }

    fun ethSource(doc: Document, url: String): MenuSource? {
        if (URI(url).host != "ethz.ch") return null
        // Legacy weekly links carry the facility id even when ETH redirects to a generic menu page.
        val weeklyId = if (URI(url).path.endsWith("/menueplaene/offerWeek.html"))
            UpcomingMenus.query(url)["id"]?.toIntOrNull()?.takeIf { it in 1..1000 } else null
        if (weeklyId != null) {
            val today = LocalDate.now(ZoneId.of("Europe/Zurich"))
            return MenuSource("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?client-id=ethz-wcms&lang=en&rs-first=0&rs-size=50&facility=$weeklyId&valid-after=$today&valid-before=${UpcomingMenus.monday(today).plusWeeks(3)}",
                "ETH public weekly menu API (facility from weekly link)", "json")
        }
        val scripts = doc.select("script").joinToString("\n") { it.data() }
        val match = Regex("fetchAndProcessWeeklyRotas\\('([^']+)',\\s*'(\\d+)'").find(scripts) ?: return null
        val base = match.groupValues[1]
        if (!base.startsWith("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?")) return null
        val monday = LocalDate.now(ZoneId.of("Europe/Zurich")).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        return MenuSource("$base&valid-after=$monday&valid-before=${monday.plusWeeks(3)}&facility=${match.groupValues[2]}", "ETH public weekly menu API", "json")
    }

    fun eth(source: SourceDocument): ReadResult {
        val root = mealJson.parseToJsonElement(source.bytes.decodeToString()).jsonObject
        val meals = mutableListOf<Meal>()
        val warnings = mutableListOf<String>()
        val query = URI(source.url).rawQuery.orEmpty().split('&').map { it.split('=', limit = 2) }.filter { it.size == 2 }.associate { it[0] to it[1] }
        val facility = query["facility"]?.toIntOrNull()
        val after = query["valid-after"]?.let(LocalDate::parse)
        val before = query["valid-before"]?.let(LocalDate::parse)
        for (rotaElement in root.array("weekly-rota-array")) {
            val rota = rotaElement.jsonObject
            if (facility != null && rota["facility-id"].text()?.toIntOrNull() != facility) continue
            val monday = LocalDate.parse(requireNotNull(rota["valid-from"].text()))
            val validTo = rota["valid-to"].text()?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: monday.plusDays(6)
            val firstWeek = if (after != null && after > monday) maxOf(monday, UpcomingMenus.monday(after)) else monday
            val lastDay = if (before != null) minOf(validTo, before.minusDays(1)) else validTo
            for (dayElement in rota.array("day-of-week-array")) {
                val day = dayElement.jsonObject
                val dayNumber = day["day-of-week-code"].text()?.toIntOrNull() ?: continue
                if (dayNumber !in 1..7) continue
                // Some ETH menus repeat their weekday pattern for several weeks (valid-from/valid-to).
                for (week in generateSequence(firstWeek) { it.plusWeeks(1) }.take(53).takeWhile { it <= lastDay }) {
                    val date = week.plusDays((dayNumber - 1).toLong())
                    if (date < monday || date > validTo || (after != null && date < after) || (before != null && date >= before)) continue
                    for (opening in day.array("opening-hour-array")) for (timeElement in opening.jsonObject.array("meal-time-array")) {
                        val time = timeElement.jsonObject
                        time["info"].text()?.takeIf { it.isNotBlank() }?.let { warnings += it }
                        for (lineElement in time.array("line-array")) {
                            val line = lineElement.jsonObject
                            val entry = line["meal"].obj() ?: continue
                            val name = entry["name"].text()?.takeIf { it.isNotBlank() } ?: continue
                            val prices = entry.array("meal-price-array").mapNotNull {
                                val value = it.jsonObject["price"].text()?.toDoubleOrNull()
                                if (value == null || !value.isFinite() || value < 0) null
                                else MealPrice(value, "CHF", it.jsonObject["customer-group-desc"].text())
                            }.sortedBy { if (it.customerGroup == "Studierende" || it.customerGroup == "Students") 0 else 1 }
                            meals += meal(source, entry["line-id"].text() ?: name, name, entry["description"].text(), line["name"].text(), date.toString(),
                                time["time-from"].text(), time["time-to"].text(), entry.array("meal-class-array").mapNotNull { it.jsonObject["desc"].text() },
                                prices, entry.array("allergen-array").mapNotNull { it.jsonObject["desc"].text() }, entry.toString(), "eth-cookpit-json")
                        }
                    }
                }
            }
        }
        if (meals.isEmpty()) warnings += "ETH publishes no meals for the requested facility and week."
        return ReadResult(source.url, source.fetchedAt, source.bytes.decodeToString().take(12000), MenuExtractor.unique(meals), warnings.distinct())
    }

    fun food2050(doc: Document, source: SourceDocument): ReadResult {
        val data = Food2050Data(doc)
        val records = data.records
        fun resolve(value: JsonElement?) = data.resolve(value)
        val meals = mutableListOf<Meal>()
        fun walk(value: JsonElement) {
            when (value) {
                is JsonArray -> value.forEach(::walk)
                is JsonObject -> {
                    if (value["__typename"].text() == "OutletMenuCategoryCalendarRangeDay") {
                        val date = resolve(resolve(value["from"]).obj()?.get("dateLocal")).text()?.take(10)
                        val items = resolve(value["menuItems"]) as? JsonArray ?: JsonArray(emptyList())
                        for (raw in items) {
                            val item = resolve(raw).obj() ?: continue
                            val dish = resolve(item["dish"]).obj() ?: continue
                            val name = resolve(dish["name"]).text()?.takeIf { it.isNotBlank() } ?: continue
                            val diets = listOf("isVegan" to "Vegan", "isVegetarian" to "Vegetarian").filter { resolve(dish[it.first]).text() == "true" }.map { it.second }
                            val allergens = (resolve(dish["allergens"]) as? JsonArray).orEmpty().mapNotNull {
                                resolve(resolve(it).obj()?.get("allergen")).obj()?.get("externalId").text()
                            }
                            meals += meal(source, item["id"].text() ?: name, name, resolve(dish["description"]).text(),
                                resolve(resolve(item["category"]).obj()?.get("name")).text(), date, diets = diets,
                                allergens = allergens, evidence = buildJsonObject { put("date", date); put("item", item); put("dish", dish) }.toString(), method = "food2050-page-data").copy(detailUrl = resolve(item["detailUrl"]).text(), details = data.expand(item) as? JsonObject)
                        }
                    } else value.values.forEach(::walk)
                }
                else -> Unit
            }
        }
        records.values.forEach(::walk)
        if (meals.isEmpty()) {
            // Individual dish URLs are also usable with read_menu_source.
            val raw = data.objects().mapNotNull { resolve(it["menuItem"]) as? JsonObject }.firstOrNull()
            if (raw != null) {
                val item = data.expand(raw).jsonObject
                val dish = item["dish"].obj()
                val name = dish?.get("name").text()
                if (dish != null && !name.isNullOrBlank()) {
                    val date = URI(source.url).path.substringAfterLast('/').takeIf { Regex("\\d{4}-\\d{2}-\\d{2}").matches(it) }
                    val diets = listOf("isVegan" to "Vegan", "isVegetarian" to "Vegetarian").filter { dish[it.first].text() == "true" }.map { it.second }
                    meals += meal(source, item["id"].text() ?: name, name, dish["description"].text(), null, date,
                        diets = diets, evidence = item.toString(), method = "food2050-page-data").copy(detailUrl = source.url, details = item)
                }
            }
        }
        val warnings = if (meals.isEmpty()) listOf("FOOD2050 publishes no supported dishes for this week, or its page format has changed.")
            else listOf("FOOD2050 weekly page does not provide prices or serving times; these remain unknown. Meals cover the published week, not just today.")
        return ReadResult(source.url, source.fetchedAt, MenuExtractor.clean(doc.body().text()).take(12000), MenuExtractor.unique(meals), warnings)
    }
}
