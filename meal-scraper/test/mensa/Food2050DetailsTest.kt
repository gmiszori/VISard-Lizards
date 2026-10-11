package mensa

import kotlinx.serialization.json.*
import kotlin.test.*

class Food2050DetailsTest {
    private fun createScraper(fetch: (String) -> SourceDocument) = MealScraper(fetch, today = { java.time.LocalDate.parse("2026-10-05") })
    private val weekly = "https://app.food2050.ch/de/zfv/uzh/raemi/lunch/menu/weekly?week=41&year=2026"
    private val detail = "https://app.food2050.ch/de/zfv/uzh/raemi/lunch,traditional/2026-10-05"
    private fun page(url: String, payload: String): SourceDocument {
        val stream = buildJsonArray { add(1); add("7:$payload\n") }
        return SourceDocument(url, "text/html", "<script>self.__next_f.push($stream)</script>".toByteArray())
    }
    private fun weeklyPage() = page(weekly, """["${'$'}","c",null,{"day":{"__typename":"OutletMenuCategoryCalendarRangeDay","from":{"dateLocal":"2026-10-05T00:00:00+02:00"},"menuItems":[{"id":"item1","detailUrl":"$detail","category":{"name":"Traditional"},"dish":{"name":"Soup","isVegan":true}}]}}]""")
    private fun detailPage(id: String = "item1") = page(detail, """["${'$'}","c",null,{"menuItem":{"id":"$id","dish":{"name":"Soup","description":"Full description","stats":{"energy":{"amount":123,"unit":"kcal"}},"ingredients":[{"name":"Lentils"}],"allergens":[{"allergen":{"name":"Sellerie"}}]},"prices":[{"amount":"6.9","currency":"CHF","priceCategory":{"name":"Studierende"}},{"amount":"9","currency":"CHF","priceCategory":{"name":"Mitarbeitende"}},{"amount":"13.5","currency":"CHF","priceCategory":{"name":"Externe"}}]}}]""")
    @Test fun weeklyGetsAllGroupPricesAndRawNutritionWithoutExtraMeals() {
        val scraper = createScraper({ url -> when {
            url == weekly -> weeklyPage()
            url.contains("/menu/weekly") -> error("Future week not published")
            else -> { assertEquals(detail, url); detailPage() }
        } })
        val result = scraper.scrape(weekly)
        val meal = result.meals.single()
        assertEquals(3, meal.prices.size); assertEquals(MealPrice(6.9,"CHF","Studierende"), meal.price)
        assertEquals("2026-10-05", meal.date); assertEquals("Traditional", meal.section)
        assertEquals(listOf("Vegan"), meal.dietaryLabels); assertEquals(listOf("Sellerie"), meal.allergens)
        assertEquals(123, meal.details!!["dish"]!!.jsonObject["stats"]!!.jsonObject["energy"]!!.jsonObject["amount"]!!.jsonPrimitive.int)
        assertFalse(result.warnings.any { it.contains("does not provide prices") })
    }
    @Test fun pdfUrlKeepsHistoricalWeekAndMatchesWeeklyIds() {
        val pdf = weekly.replace("/weekly?", "/weekly.pdf?")
        val requested = mutableListOf<String>()
        val scraper = createScraper({ url -> requested += url; when(url) {
            pdf -> SourceDocument(pdf,"application/pdf","%PDF-fixture".toByteArray())
            weekly -> weeklyPage()
            detail -> detailPage()
            else -> error("Unexpected URL: $url")
        } })
        val fromPdf = scraper.read(pdf)
        assertEquals(pdf, fromPdf.url); assertEquals(listOf(pdf,weekly,detail), requested)
        assertEquals(scraper.scrape(weekly).meals.single().id, fromPdf.meals.single().id)
        assertEquals(3, fromPdf.meals.single().prices.size)
    }
    @Test fun badOrUnavailableDetailsNeverOverwriteWeeklyDish() {
        for (wrongId in listOf(true,false)) {
            val scraper = createScraper({ url -> when {
                url == weekly -> weeklyPage()
                url.contains("/menu/weekly") -> error("Future week not published")
                wrongId -> detailPage("other-item")
                else -> error("HTTP 503")
            } })
            val result = scraper.scrape(weekly)
            assertEquals("Soup", result.meals.single().name); assertNull(result.meals.single().price)
            assertTrue(result.warnings.any { it.contains("Could not enrich") })
        }
    }
    @Test fun individualDishReadsReturnFullDataWithSameIdentity() {
        val scraper = createScraper({ url -> if(url == weekly) weeklyPage() else detailPage() })
        val summary = scraper.read(weekly).meals.single()
        val direct = scraper.read(detail).meals.single()
        assertEquals(summary.id, direct.id); assertEquals(summary.prices, direct.prices)
        assertEquals(summary.date, direct.date); assertNotNull(direct.details)
    }
}
