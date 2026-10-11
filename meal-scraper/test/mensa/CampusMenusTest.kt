package mensa

import kotlinx.serialization.json.*
import kotlin.test.*

class CampusMenusTest {
    private val extractor = MenuExtractor()
    @Test fun missingEnglishEthNamesUseGermanMenuWithoutLosingDatesOrPrices() {
        val calls = mutableListOf<String>()
        val scraper = MealScraper({ url ->
            calls += url
            val name = if (url.contains("lang=de")) "Pasta" else "novalue"
            val json = """{"weekly-rota-array":[{"facility-id":3,"valid-from":"2026-10-12","day-of-week-array":[{"day-of-week-code":1,"opening-hour-array":[{"meal-time-array":[{"time-from":"11:00","time-to":"14:00","line-array":[{"name":"Lunch","meal":{"line-id":1,"name":"$name","meal-price-array":[{"price":9.9,"customer-group-desc":"Studierende"}]}}]}]}]}]}]}"""
            SourceDocument(url,"application/json",json.toByteArray())
        }, today = { java.time.LocalDate.parse("2026-10-11") })
        val url = "https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?facility=3&lang=en&valid-after=2026-10-12&valid-before=2026-10-19"
        val entry = scraper.read(url,java.time.LocalDate.parse("2026-10-12")).meals.single()
        assertEquals("Pasta",entry.name); assertEquals("2026-10-12",entry.date)
        assertEquals("11:00",entry.timeStart); assertEquals(9.9,entry.price?.amount)
        assertTrue(entry.sourceUrl.contains("lang=de")); assertEquals(2,calls.size)
    }
    @Test fun foodFlightChunksResolveSharedReferencesAndKeepDifferentDays() {
        val record = """7:["${'$'}","component",null,{"outlet":{"calendar":{"__typename":"OutletMenuCategoryCalendarRangeDay","from":{"dateLocal":"2026-10-05T00:00:00+02:00"},"menuItems":[{"id":"one","category":{"name":"Traditional"},"dish":{"name":"Soup","description":"Lentils","isVegan":true,"isVegetarian":true,"allergens":[{"allergen":{"externalId":"celery"}}]}}]},"next":{"__typename":"OutletMenuCategoryCalendarRangeDay","from":{"dateLocal":"2026-10-06T00:00:00+02:00"},"menuItems":[{"id":"two","category":"${'$'}7:props:outlet:calendar:menuItems:0:category","dish":"${'$'}7:props:outlet:calendar:menuItems:0:dish"}]}}}]
        """.trimIndent()
        val split = record.length / 2
        fun script(chunk: String) = "<script>self.__next_f.push(" + buildJsonArray { add(1); add(chunk) } + ")</script>"
        val html = script(record.take(split)) + script(record.drop(split))
        val result = extractor.read(SourceDocument("https://app.food2050.ch/de/zfv/venue/menu/weekly", "text/html", html.toByteArray()))
        assertEquals(2, result.meals.size)
        assertEquals(setOf("2026-10-05", "2026-10-06"), result.meals.map { it.date }.toSet())
        assertEquals(2, result.meals.map { it.id }.toSet().size)
        result.meals.forEach {
            assertEquals("Soup", it.name); assertEquals("Traditional", it.section)
            assertEquals(listOf("Vegan", "Vegetarian"), it.dietaryLabels)
            assertEquals(listOf("celery"), it.allergens); assertNull(it.price); assertNull(it.timeStart)
        }
    }
    @Test fun ethFiltersFacilityAndWeekAndKeepsPricesAndServingTimes() {
        val meal = """{"line-id":1,"name":"Pasta","description":"Pesto","meal-price-array":[{"price":12.9,"customer-group-desc":"Extern"},{"price":9.9,"customer-group-desc":"Studierende"}],"allergen-array":[{"desc":"Milch"}]}"""
        fun rota(facility: Int, date: String) = """{"facility-id":$facility,"valid-from":"$date","day-of-week-array":[{"day-of-week-code":1,"opening-hour-array":[{"meal-time-array":[{"time-from":"11:30","time-to":"14:00","line-array":[{"name":"PASTA","meal":$meal},{"name":"PASTA","meal":$meal}]}]}]}]}"""
        val json = """{"weekly-rota-array":[${rota(10,"2026-10-05")},${rota(11,"2026-10-05")},${rota(10,"2026-10-12")}]}"""
        val result = extractor.read(SourceDocument("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?facility=10&valid-after=2026-10-05&valid-before=2026-10-12", "application/json", json.toByteArray()))
        val entry = result.meals.single()
        assertEquals("2026-10-05", entry.date); assertEquals("11:30", entry.timeStart); assertEquals("14:00", entry.timeEnd)
        assertEquals(MealPrice(9.9, "CHF", "Studierende"), entry.price)
        assertEquals(2, entry.prices.size); assertEquals(listOf("Milch"), entry.allergens)
    }
    @Test fun ethDiscoveryUsesOnlyPublishedFacilityEndpoint() {
        val page = SourceDocument(MensaSources.locations.single { it.id == "polysnack" }.url, "text/html", """<script>fetchAndProcessWeeklyRotas('https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?client-id=ethz-wcms&lang=de&rs-first=0&rs-size=50', '10', 'menus', 'hours');</script>""".toByteArray())
        val source = extractor.discover(page).sources.single()
        assertEquals("json", source.kind); assertTrue(source.url.contains("&facility=10")); assertTrue(source.url.contains("valid-after="))
        assertTrue(extractor.discover(page.copy(url="https://other.example/polysnack")).sources.isEmpty())
    }
    @Test fun closedAndMissingZfvMenusHaveExplicitWarnings() {
        val closed = extractor.read(SourceDocument("https://www.zfv.ch/de/essen-gehen/lichthof", "text/html", "<p>Aufgrund von Umbauarbeiten vorübergehend geschlossen.</p>".toByteArray()))
        assertTrue(closed.warnings.any { it.contains("temporarily closed") })
        val absent = extractor.read(SourceDocument("https://www.zfv.ch/de/essen-gehen/irchel-bar", "text/html", "<p>Bar open</p>".toByteArray()))
        assertTrue(absent.warnings.any { it.contains("publishes no menu") })
    }
    @Test fun legacyWeeklyLinkRetainsMendokoroFacilityWithoutPageScripts() {
        val url="https://ethz.ch/en/campus/erleben/gastronomie-und-einkaufen/gastronomie/menueplaene/offerWeek.html?date=2026-10-12&id=16"
        val page=SourceDocument(url,"text/html","<h1>Menu plans</h1>".toByteArray())
        val source=extractor.discover(page).sources.single()
        assertEquals("json",source.kind)
        assertEquals("16",UpcomingMenus.query(source.url)["facility"])
        assertEquals(java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich")).toString(),UpcomingMenus.query(source.url)["valid-after"])
        assertTrue(extractor.discover(page.copy(url=url.replace("ethz.ch","other.example"))).sources.isEmpty())
        assertTrue(extractor.discover(page.copy(url=url.replace("id=16","id=invalid"))).sources.isEmpty())
    }
    @Test fun ethRepeatsWeekdayMenusThroughPublishedValidityEnd() {
        val json="""{"weekly-rota-array":[{"facility-id":16,"valid-from":"2026-09-28","valid-to":"2026-10-25","day-of-week-array":[{"day-of-week-code":1,"opening-hour-array":[{"meal-time-array":[{"time-from":"11:15","time-to":"14:00","line-array":[{"meal":{"line-id":1,"name":"Ramen"}}]}]}]}]}]}"""
        val source=SourceDocument("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?facility=16&valid-after=2026-10-10&valid-before=2026-10-26","application/json",json.toByteArray())
        val meals=extractor.read(source).meals
        assertEquals(listOf("2026-10-12","2026-10-19"),meals.map { it.date })
        assertEquals(2,meals.map { it.id }.toSet().size)
        assertTrue(extractor.read(source.copy(url=source.url.replace("2026-10-10","2026-10-26").replace("valid-before=2026-10-26","valid-before=2026-11-02"))).meals.isEmpty())
    }
}
