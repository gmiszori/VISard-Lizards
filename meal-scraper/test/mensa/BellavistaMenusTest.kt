package mensa

import java.io.ByteArrayOutputStream
import java.time.LocalDate
import kotlin.test.*
import org.apache.pdfbox.pdmodel.*
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.*

class BellavistaMenusTest {
    private val url = "https://bellavista-ethz.ch/wp-content/uploads/2026/10/Menue_KW_424344_DE_EN.pdf"
    private fun pdf(): ByteArray {
        val output = ByteArrayOutputStream()
        PDDocument().use { document ->
            for (week in 0..2) for (english in listOf(false, true)) {
                val page = PDPage(PDRectangle.A4)
                document.addPage(page)
                PDPageContentStream(document, page).use { stream ->
                    fun line(x: Float, y: Float, value: String, bold: Boolean = false) {
                        stream.beginText()
                        stream.setFont(PDType1Font(if (bold) Standard14Fonts.FontName.HELVETICA_BOLD else Standard14Fonts.FontName.HELVETICA), 10f)
                        stream.newLineAtOffset(x, y); stream.showText(value); stream.endText()
                    }
                    line(450f, 755f, "${12 + week * 7}. - ${16 + week * 7}. ${if (english) "October" else "Oktober"}")
                    line(170f, 600f, if (english) "MAIN COURSES" else "HAUPTGÄNGE")
                    line(170f, 575f, if (english) "Beef Roulade" else "Geschmorter Fleischvogel", true)
                    line(170f, 559f, "Jus | Kartoffelknödel | Rotkraut"); line(518f, 559f, "30.-")
                    line(170f, 507f, if (english) "Cod Fillet" else "Dorschfilet", true)
                    line(170f, 491f, "Quinoa | Zitronenjoghurt"); line(518f, 491f, "29.-")
                    line(170f, 439f, if (english) "Spelt Fusilli" else "Urdinkel-Spiralnudeln", true)
                    line(170f, 423f, "Linsenbolognese | Gemüsewürfel"); line(518f, 423f, "28.-")
                    line(170f, 407f, "Marinierter Blattspinat")
                    line(170f, 391f, if (english) "vegetarian & sustainable" else "vegetarisch & ressourcenschonend")
                    line(170f, 330f, "DESSERT"); line(170f, 310f, "Affogato"); line(518f, 295f, "5.-")
                    line(170f, 60f, "Preise in CHF inkl. MwSt.")
                }
            }
            document.save(output)
        }
        return output.toByteArray()
    }
    @Test fun readsThreeWeeksWithCorrectPricesDescriptionsAndNoEnglishDuplicates() {
        val result = MenuExtractor().read(SourceDocument(url, "application/pdf", pdf()))
        assertEquals(60, result.meals.size)
        assertEquals(60, result.meals.map { it.id }.toSet().size)
        assertEquals(setOf(1, 3, 5), result.meals.map { it.sourcePage }.toSet())
        assertEquals(setOf("2026-10-12", "2026-10-19", "2026-10-26"), result.meals.filter { it.name == "Dorschfilet" }.map { LocalDate.parse(it.date).with(java.time.DayOfWeek.MONDAY).toString() }.toSet())
        val pasta = result.meals.first { it.name == "Urdinkel-Spiralnudeln" }
        assertEquals(MealPrice(28.0, "CHF"), pasta.price)
        assertTrue(pasta.description!!.contains("Marinierter Blattspinat"))
        assertEquals(listOf("Vegetarian"), pasta.dietaryLabels)
        assertTrue(result.meals.all { it.sourceUrl == url && it.timeStart == null && it.allergens.isEmpty() })
        assertEquals(15, result.meals.count { it.name == "Affogato" && it.section == "Dessert" && it.price?.amount == 5.0 })
        assertFalse(result.meals.any { it.name == "Cod Fillet" })
        val overlapping = MenuExtractor().read(SourceDocument(url.replace("424344", "414243"), "application/pdf", pdf()))
        assertEquals(60, MenuExtractor.unique(result.meals + overlapping.meals).size)
    }
    @Test fun upcomingFiltersPastDaysAndDoesNotGuessYearForAnUnversionedUrl() {
        val scraper = MealScraper({ SourceDocument(it, "application/pdf", pdf()) }, today = { LocalDate.parse("2026-10-15") })
        val result = scraper.scrape(url)
        assertEquals(48, result.meals.size)
        assertTrue(result.meals.all { LocalDate.parse(it.date) >= LocalDate.parse("2026-10-15") })
        val unknownYear = MenuExtractor().read(SourceDocument("https://bellavista-ethz.ch/menu.pdf", "application/pdf", pdf()))
        assertTrue(unknownYear.meals.isEmpty())
    }
}
