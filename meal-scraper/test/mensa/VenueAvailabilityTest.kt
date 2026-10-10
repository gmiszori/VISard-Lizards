package mensa

import kotlin.test.*
import java.time.LocalDate

class VenueAvailabilityTest {
    private val today = LocalDate.parse("2026-10-10")
    private fun scraper(html: String) = MealScraper({ url -> SourceDocument(url, "text/html", html.toByteArray()) }, today = { today })
    @Test fun futureRenovationIsAResultWithoutMeals() {
        val result = scraper("<h1>Polysnack</h1><p>12.–16. Oktober 2026: Geschlossen wegen Renovierungsarbeiten</p>").scrape("https://example.com/polysnack")
        assertEquals("closure_found", result.status)
        assertTrue(result.meals.isEmpty())
        val closure = result.availability.single()
        assertEquals("2026-10-12", closure.dateFrom)
        assertEquals("2026-10-16", closure.dateTo)
        assertTrue(closure.evidence.contains("Renovierungsarbeiten"))
        assertEquals(result.url, closure.sourceUrl)
    }
    @Test fun indefiniteClosureHasUnknownDatesAndRemainsVisible() {
        val result = scraper("<p>Aufgrund von Umbauarbeiten vorübergehend geschlossen.</p>").scrape("https://www.zfv.ch/de/essen-gehen/lichthof")
        assertEquals("closure_found", result.status)
        assertNull(result.availability.single().dateFrom)
        assertNull(result.availability.single().dateTo)
    }
    @Test fun expiredSummerHolidayIsNotAnUpcomingClosure() {
        val url = "https://www.zfv.ch/de/essen-gehen/irchel-bar"
        val scraper = scraper("<p>Von 13.07.2026 bis 16.08.2026 bleibt die Irchel Bar geschlossen.</p>")
        assertTrue(scraper.read(url).availability.isNotEmpty()) // Exact reads retain historical evidence.
        assertTrue(scraper.discover(url).availability.isEmpty(), scraper.discover(url).availability.toString())
        val result = scraper.scrape(url)
        assertTrue(result.availability.isEmpty())
        assertEquals("no_supported_menu_found", result.status)
    }
    @Test fun absenceAndRegularWeekendClosingDoNotImplyClosure() {
        val result = scraper("<p>Samstag - Sonntag: geschlossen</p><p>Kein Menü verfügbar</p>").scrape("https://example.com/bar")
        assertTrue(result.availability.isEmpty())
        assertEquals("no_supported_menu_found", result.status)
    }
    @Test fun closureFiltersOnlyMealsWithinItsDates() {
        val closure = AvailabilityNotice(dateFrom="2026-10-12", dateTo="2026-10-16", evidence="Renovation", sourceUrl="https://example.com")
        fun meal(date: String) = Meal(date, "Soup", null, null, null, emptyList(), "https://example.com", null, "Soup", "test", date=date)
        val result = UpcomingMenus.select(ReadResult("https://example.com", "now", "", listOf(meal("2026-10-12"), meal("2026-10-19")), emptyList(), listOf(closure)), today)
        assertEquals(listOf("2026-10-19"), result.meals.map { it.date })
        assertEquals(listOf(closure), result.availability)
    }
}
