package mensa

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant

val mealJson = Json { encodeDefaults = true }
fun now(): String = Instant.now().toString()

@Serializable data class MenuSource(val url: String, val label: String, val kind: String)
data class SourceDocument(val url: String, val mediaType: String, val bytes: ByteArray, val fetchedAt: String = now())
// Amount is a JSON number. No application DTOs are imposed on the consuming backend.
@Serializable data class MealPrice(val amount: Double, val currency: String, val customerGroup: String? = null)
@Serializable data class Meal(
    val id: String, val name: String, val description: String?, val price: MealPrice?,
    val section: String?, val dietaryLabels: List<String>, val sourceUrl: String,
    val sourcePage: Int?, val evidence: String, val extractionMethod: String,
    val date: String? = null, val timeStart: String? = null, val timeEnd: String? = null,
    val prices: List<MealPrice> = emptyList(), val allergens: List<String> = emptyList(),
    val detailUrl: String? = null, val details: kotlinx.serialization.json.JsonObject? = null,
)
@Serializable data class AvailabilityNotice(
    val status: String = "closed", val dateFrom: String? = null, val dateTo: String? = null,
    val evidence: String, val sourceUrl: String,
)
@Serializable data class DiscoveryResult(
    val url: String, val title: String, val fetchedAt: String,
    val sources: List<MenuSource>, val pageText: String, val warnings: List<String>, val availability: List<AvailabilityNotice> = emptyList(),
)
@Serializable data class ReadResult(
    val url: String, val fetchedAt: String, val text: String, val meals: List<Meal>, val warnings: List<String>, val availability: List<AvailabilityNotice> = emptyList(),
)
@Serializable data class ScrapeResult(
    val url: String, val retrievedAt: String, val status: String, val meals: List<Meal>,
    val sources: List<MenuSource>, val warnings: List<String>, val availability: List<AvailabilityNotice> = emptyList(),
)
