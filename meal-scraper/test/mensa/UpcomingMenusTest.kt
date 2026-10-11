package mensa

import java.time.LocalDate
import kotlinx.serialization.json.*
import kotlin.test.*

class UpcomingMenusTest {
    @Test fun explicitDateControlsWeekLookupAndExcludesEarlierMeals() {
        val calls = mutableListOf<String>()
        val scraper = MealScraper({ sourceUrl ->
            calls += sourceUrl
            page(sourceUrl, listOf("2026-10-10", "2026-10-12", "2026-10-19", "2026-10-20"))
        }, today = { LocalDate.parse("2026-10-10") })
        val meals = scraper.scrape(url, LocalDate.parse("2026-10-19")).meals
        assertEquals(listOf("2026-10-19", "2026-10-20"), meals.map { it.date })
        assertTrue(calls[1].contains("week=43&year=2026"))
        assertEquals(listOf("2026-10-10", "2026-10-12", "2026-10-19", "2026-10-20"),
            scraper.scrape(url, LocalDate.parse("2026-10-01")).meals.map { it.date })
    }
    @Test fun dateArgumentsRejectInvalidCalendarDatesAndTypes() {
        assertNull(menuDate(buildJsonObject { put("url", url) }))
        assertNull(menuDate(buildJsonObject { put("url", url); put("date", JsonNull) }))
        for (date in listOf(JsonPrimitive("2026-02-30"), JsonPrimitive("tomorrow"), JsonPrimitive(20261012))) {
            assertFailsWith<IllegalArgumentException> { menuDate(buildJsonObject { put("url", url); put("date", date) }) }
        }
    }
    private val url = "https://app.food2050.ch/de/zfv/uzh/raemi/lunch/menu/weekly"
    private fun page(sourceUrl: String, dates: List<String>): SourceDocument {
        val daily = buildJsonArray { dates.forEach { date -> add(buildJsonObject {
            put("__typename", "OutletMenuCategoryCalendarRangeDay")
            putJsonObject("from") { put("dateLocal", "${date}T00:00:00+02:00") }
            putJsonArray("menuItems") { add(buildJsonObject { put("id",date); putJsonObject("dish") { put("name","Soup") } }) }
        }) } }
        val chunk = buildJsonArray { add(1); add("7:$daily\n") }
        return SourceDocument(sourceUrl,"text/html","<script>self.__next_f.push($chunk)</script>".toByteArray())
    }
    @Test fun weekdayKeepsTodayAndFutureAndNeverPastDates() {
        val calls = mutableListOf<String>()
        val scraper = MealScraper({ sourceUrl -> calls += sourceUrl; page(sourceUrl,listOf("2026-10-05","2026-10-09","2026-10-08")) }, today = { LocalDate.parse("2026-10-08") })
        val meals = scraper.scrape(url).meals
        assertEquals(listOf("2026-10-08","2026-10-09"), meals.map { it.date })
        assertEquals(4,calls.size)
        assertTrue(calls[1].contains("week=41&year=2026"))
        assertTrue(calls.last().contains("week=43&year=2026"))
    }
    @Test fun weekendChecksNextWeekAndOldPdfAdvances() {
        val old = "$url.pdf?week=40&year=2026"
        val calls = mutableListOf<String>()
        val scraper = MealScraper({ sourceUrl ->
            calls += sourceUrl
            when {
                sourceUrl == old -> SourceDocument(old,"application/pdf","%PDF-fixture".toByteArray())
                sourceUrl.contains("week=41") -> page(sourceUrl,listOf("2026-10-09"))
                sourceUrl.contains("week=42") -> page(sourceUrl,listOf("2026-10-12","2026-10-13"))
                sourceUrl.contains("week=43") -> error("Next menu not yet published")
                else -> error("Unexpected week: $sourceUrl")
            }
        }, today = { LocalDate.parse("2026-10-10") })
        val result = scraper.scrape(old)
        assertEquals(listOf("2026-10-12","2026-10-13"), result.meals.map { it.date })
        assertTrue(result.warnings.any { it.contains("showing the next published meals") })
        assertEquals(4,calls.size)
        assertTrue(result.sources.any { it.url.contains("week=42") })
        assertTrue(result.warnings.any { it.contains("Next menu not yet published") })
    }
    @Test fun todaysMealsDoNotStopFutureWeeksAndAllDatesKeepSourceReferences() {
        val calls = mutableListOf<String>()
        val scraper = MealScraper({ sourceUrl ->
            calls += sourceUrl
            page(sourceUrl, when {
                sourceUrl.contains("week=42") -> listOf("2026-10-12", "2026-10-13")
                sourceUrl.contains("week=43") -> listOf("2026-10-19")
                else -> listOf("2026-10-09", "2026-10-10")
            })
        }, today = { LocalDate.parse("2026-10-10") })
        val result = scraper.scrape(url)
        assertEquals(listOf("2026-10-10", "2026-10-12", "2026-10-13", "2026-10-19"), result.meals.map { it.date })
        assertEquals(4, calls.size)
        assertEquals(result.meals.size, result.meals.map { it.id }.toSet().size)
        assertTrue(result.meals.all { meal -> result.sources.any { it.url == meal.sourceUrl } })
        assertFalse(result.warnings.any { it.startsWith("No meals are published for today") })
    }
    @Test fun lookaheadIsBoundedAndNeverFallsBackToPastMeals() {
        var calls = 0
        val scraper = MealScraper({ sourceUrl -> calls++; page(sourceUrl,listOf("2026-10-05")) },today = { LocalDate.parse("2026-10-10") })
        val result = scraper.scrape(url)
        assertTrue(result.meals.isEmpty()); assertEquals(4,calls)
        assertTrue(result.warnings.any { it.contains("three-week window") })
    }
    @Test fun isoYearBoundaryAndExplicitFutureWeekArePreserved() {
        val date = LocalDate.parse("2027-01-01")
        assertTrue(UpcomingMenus.foodWeek(url,UpcomingMenus.firstFoodWeek(url,date)).endsWith("week=53&year=2026"))
        assertEquals(LocalDate.parse("2027-01-11"),UpcomingMenus.firstFoodWeek("$url?week=2&year=2027",date))
        assertTrue(UpcomingMenus.ethUpcoming("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?facility=10&valid-after=2026-10-05",LocalDate.parse("2026-10-10")).contains("valid-after=2026-10-10&valid-before=2026-10-26"))
    }
}
