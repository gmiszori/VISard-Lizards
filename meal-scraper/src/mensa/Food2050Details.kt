package mensa

import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import java.net.URI

class Food2050Details(private val fetch: (String) -> SourceDocument) {
    fun enrich(result: ReadResult): ReadResult {
        val warnings = result.warnings.toMutableList()
        val start = System.nanoTime()
        var attempts = 0
        var complete = 0
        val meals = result.meals.map { meal ->
            val url = meal.detailUrl ?: return@map meal
            if (attempts >= 100 || (System.nanoTime() - start) / 1_000_000_000 > 150) {
                warnings += "FOOD2050 detail limit reached; some dishes retain weekly summary data."
                return@map meal
            }
            try {
                val detail = URI(PublicWebFetcher.validateUrl(url))
                val weekly = URI(meal.sourceUrl)
                val outletPrefix = weekly.path.split('/').take(5).joinToString("/") + "/"
                require(detail.host == "app.food2050.ch" && detail.path.startsWith(outletPrefix)) { "Detail URL must belong to the selected FOOD2050 outlet." }
                attempts++
                val source = fetch(url)
                val data = Food2050Data(Jsoup.parse(source.bytes.inputStream(), null, source.url))
                val raw = data.objects().mapNotNull { data.resolve(it["menuItem"]) as? JsonObject }.firstOrNull()
                    ?: error("Dish detail data not found.")
                val item = data.expand(raw).jsonObject
                require(item["id"] == meal.details?.get("id")) { "Dish detail does not match the weekly menu item." }
                val dish = item["dish"]?.jsonObject ?: error("Dish detail missing.")
                fun text(node: JsonElement?) = (node as? JsonPrimitive)?.contentOrNull
                val prices = (item["prices"] as? JsonArray).orEmpty().mapNotNull {
                    val price = it.jsonObject
                    val amount = text(price["amount"])?.toDoubleOrNull()
                    val currency = text(price["currency"])
                    if (amount == null || !amount.isFinite() || amount < 0 || currency.isNullOrBlank()) null
                    else MealPrice(amount, currency, text((price["priceCategory"] as? JsonObject)?.get("name")))
                }.sortedBy { if (it.customerGroup == "Studierende") 0 else 1 }
                val allergens = (dish["allergens"] as? JsonArray).orEmpty().mapNotNull {
                    val allergen = (it.jsonObject["allergen"] as? JsonObject)
                    text(allergen?.get("name")) ?: text(allergen?.get("externalId"))
                }
                complete++
                meal.copy(name = text(dish["name"]) ?: meal.name, description = text(dish["description"]) ?: meal.description,
                    prices = prices, price = prices.firstOrNull(), allergens = allergens, details = item,
                    extractionMethod = "food2050-weekly-and-detail", evidence = item.toString())
            } catch (ex: Exception) {
                warnings += "Could not enrich FOOD2050 dish ${meal.name} from $url: ${ex.message}"
                meal
            }
        }
        if (complete == meals.size && meals.isNotEmpty()) {
            warnings.removeAll { it.startsWith("FOOD2050 weekly page does not provide prices") }
            warnings += "Meals retain their published dates. Serving times remain unknown unless explicitly published; prices and dish details quote individual menu pages."
        }
        return result.copy(meals = meals, warnings = warnings.distinct())
    }
}
