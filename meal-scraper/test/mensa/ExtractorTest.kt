package mensa

import kotlin.test.*
import org.apache.pdfbox.pdmodel.*
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import java.io.ByteArrayOutputStream

class ExtractorTest {
    @Test fun zfvDiscoveryExcludesRecommendedRestaurantsAndSelfLinks() {
        val source = SourceDocument("https://www.zfv.ch/de/essen-gehen/raemi-59", "text/html", """
            <a href='#menu'>Menüplan</a>
            <div id='menu'><iframe src='https://app.food2050.ch/de/zfv/raemi/menu/weekly'></iframe>
            <a href='https://app.food2050.ch/de/zfv/raemi/menu/weekly'></a></div>
            <a href='/de/essen-gehen/other#menu'>Menüplan</a>
        """.toByteArray())
        assertEquals(listOf("https://app.food2050.ch/de/zfv/raemi/menu/weekly"), MenuExtractor().discover(source).sources.map { it.url })
        assertTrue(MenuExtractor().discover(source.copy(bytes = "<h1>Lichthof</h1><a href='/de/essen-gehen/other#menu'>Menüplan</a>".toByteArray())).sources.isEmpty())
    }
    @Test fun zfvDiscoversCateringPdfsInCateringAndEventsWithoutRecommendations() {
        val source = SourceDocument("https://www.zfv.ch/de/essen-gehen/irchel-bar", "text/html", """
            <div id='catering'><a href='/files/card.pdf'>Download</a><a href='/files/card.pdf#page=1'>Catering</a></div>
            <div id='events'><a href='/files/irchel-catering.pdf'>Cateringangebot</a><a href='/event'>Event booking</a></div>
            <div><a href='/de/essen-gehen/other#menu'>Menüplan</a><a href='/files/other.pdf'>Catering</a></div>
        """.toByteArray())
        val sources = MenuExtractor().discover(source).sources
        assertEquals(listOf("https://www.zfv.ch/files/card.pdf", "https://www.zfv.ch/files/irchel-catering.pdf"), sources.map { it.url })
        assertTrue(sources.all { it.kind == "pdf" && it.label.startsWith("Catering:") })
    }
    @Test fun allRequestedLocationsHaveDistinctPublicUrls() {
        val locations = MensaSources.locations
        assertEquals(22, locations.size)
        assertEquals(22, locations.map { it.id }.toSet().size)
        assertEquals(22, locations.map { it.url }.toSet().size)
        locations.flatMap { listOf(it.url) + it.additionalUrls }.forEach {
            assertEquals(it, PublicWebFetcher.validateUrl(it))
            assertTrue(MensaSources.toolHint.contains(it))
        }
    }
    private val extractor = MenuExtractor()
    private fun html(text: String) = SourceDocument("https://restaurant.example/de", "text/html", text.toByteArray())

    @Test fun discoversAnchorsAndEmbeddedNuxtPdf() {
        val result = extractor.discover(html("""<h1>Cafe</h1><a href='/menu.pdf'>Food</a><a href='/menu.pdf#page=1'>Menu</a><a href='#menu'>Menu</a><a href='/menu-photo.jpg'>Menu</a><iframe src='https://www.googletagmanager.com/ns.html?id=GTM-test'></iframe><a href='/privacy'>Privacy</a><script type='application/json'>["https:\/\/cdn.example\/Menu_Bar.pdf"]</script>"""))
        assertEquals(listOf("https://restaurant.example/menu.pdf", "https://cdn.example/Menu_Bar.pdf"), result.sources.map { it.url })
    }
    @Test fun readsJsonLdPreservesUnknownsAndDeduplicates() {
        val item = """{"@type":"MenuItem","name":"Soup","description":"Lentils","offers":{"price":"7.50","priceCurrency":"CHF"},"suitableForDiet":"https://schema.org/VeganDiet"}"""
        val result = extractor.read(html("""<script type='application/ld+json'>{"@type":"MenuSection","name":"Lunch","hasMenuItem":[$item,$item]}</script>"""))
        val meal = result.meals.single()
        assertEquals("Soup", meal.name); assertEquals("Lunch", meal.section)
        assertEquals(MealPrice(7.5, "CHF"), meal.price)
        assertEquals(listOf("https://schema.org/VeganDiet"), meal.dietaryLabels)
        assertNull(meal.date); assertNull(meal.timeStart); assertNull(meal.timeEnd)
        assertEquals(20, meal.id.length)
    }
    @Test fun priceWithoutCurrencyIsUnknown() {
        val result = extractor.read(html("""<script type='application/ld+json'>{"@type":"MenuItem","name":"Soup","offers":{"price":7.5}}</script>"""))
        assertNull(result.meals.single().price)
    }
    @Test fun randomPricesAreNotMeals() {
        val result = extractor.read(html("<p>Opening hours 13-23. Tickets CHF 4.00</p>"))
        assertTrue(result.meals.isEmpty()); assertTrue(result.warnings.isNotEmpty())
    }
    @Test fun explicitHtmlCurrencyRequiredOnItem() {
        val result = extractor.read(html("<p>CHF</p><div class='dish'><h3>Soup</h3>7.00</div><div class='menu-item'><h3>Salad</h3>CHF 8.00</div>"))
        assertEquals("Salad", result.meals.single().name)
    }
    @Test fun malformedJsonDoesNotPreventOtherBlocks() {
        val result = extractor.read(html("""<script type='application/ld+json'>{oops}</script><script type='application/ld+json'>{"@type":"MenuItem","name":"Soup"}</script>"""))
        assertEquals("Soup", result.meals.single().name); assertTrue(result.warnings.isNotEmpty())
    }
    @Test fun columnsAndPortionsStaySeparateInPdf() {
        val output = ByteArrayOutputStream()
        PDDocument().use { document ->
            val page = PDPage(PDRectangle(1000f, 1000f)); document.addPage(page)
            PDPageContentStream(document, page).use { stream ->
                fun line(x: Float, y: Float, text: String, size: Float = 16f) {
                    stream.beginText(); stream.setFont(PDType1Font(Standard14Fonts.FontName.HELVETICA), size)
                    stream.newLineAtOffset(x, y); stream.showText(text); stream.endText()
                }
                line(30f, 950f, "FOOD CHF"); line(530f, 950f, "SNACKS CHF")
                line(30f, 800f, "Hummus Big"); line(400f, 800f, "11.90"); line(30f, 775f, "Vegan")
                line(30f, 700f, "Hummus Small"); line(400f, 700f, "9.90"); line(30f, 675f, "Vegan")
                line(530f, 800f, "Pretzel"); line(900f, 800f, "3.50"); line(530f, 775f, "Vegetarian")
            }
            document.save(output)
        }
        val result = extractor.read(SourceDocument("https://restaurant.example/menu.pdf", "application/pdf", output.toByteArray()))
        assertEquals(3, result.meals.size)
        assertEquals(setOf("Hummus Big", "Hummus Small", "Pretzel"), result.meals.map { it.name }.toSet())
        assertTrue(result.meals.all { it.sourcePage == 1 && it.dietaryLabels.isNotEmpty() })
    }
    @Test fun scrapeFollowsMenusAndReportsFailures() {
        val scraper = MealScraper({ url -> when {
            url.endsWith("de") -> html("<a href='/menu'>Food</a><a href='/menu2'>Menu</a>")
            url.endsWith("menu2") -> error("Unavailable")
            else -> SourceDocument(url, "text/html", """<script type='application/ld+json'>{"@type":"MenuItem","name":"Soup"}</script>""".toByteArray())
        } })
        val result = scraper.scrape("https://restaurant.example/de")
        assertEquals("meals_found", result.status); assertEquals("Soup", result.meals.single().name)
        assertTrue(result.warnings.any { it.contains("Unavailable") })
    }
}
