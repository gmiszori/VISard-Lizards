package mensa

import java.net.URI
import java.security.MessageDigest
import java.time.LocalDate
import org.apache.pdfbox.text.TextPosition

/** Bellavista publishes one German and one English page for each dated lunch week. */
object BellavistaMenus {
    private val months = listOf("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember")
    private val range = Regex("(\\d{1,2})\\.\\s*[-–—]\\s*(\\d{1,2})\\.\\s*(" + months.joinToString("|") + ")(?:\\s+(20\\d{2}))?", RegexOption.IGNORE_CASE)
    private val price = Regex("(?<!\\d)(\\d{1,3})(?:[.,](\\d{2})|[.,]-)")
    private data class Row(val y: Float, val chars: MutableList<TextPosition>)
    private data class Line(val text: String, val y: Float, val bold: Boolean)

    fun readPage(url: String, page: Int, text: String, positions: List<TextPosition>, pageWidth: Float): List<Meal> {
        if (URI(url).host != "bellavista-ethz.ch" || !text.contains("HAUPTGÄNGE") || !text.contains("CHF")) return emptyList()
        val dates = range.find(text) ?: return emptyList()
        // The document's upload year is published evidence; never guess from the current year.
        val year = dates.groupValues[4].toIntOrNull()
            ?: Regex("/uploads/(20\\d{2})/").find(URI(url).path)?.groupValues?.get(1)?.toIntOrNull()
            ?: return emptyList()
        val month = months.indexOfFirst { it.equals(dates.groupValues[3], true) } + 1
        val from = runCatching { LocalDate.of(year, month, dates.groupValues[1].toInt()) }.getOrNull() ?: return emptyList()
        val to = runCatching { LocalDate.of(year, month, dates.groupValues[2].toInt()) }.getOrNull() ?: return emptyList()
        if (to < from || to > from.plusDays(6)) return emptyList()
        val rows = mutableListOf<Row>()
        positions.sortedBy { it.yDirAdj }.forEach { char ->
            val row = rows.firstOrNull { kotlin.math.abs(it.y - char.yDirAdj) < 2f }
            if (row == null) rows += Row(char.yDirAdj, mutableListOf(char)) else row.chars += char
        }
        fun line(chars: List<TextPosition>): String {
            val value = StringBuilder()
            var previous: TextPosition? = null
            chars.sortedBy { it.xDirAdj }.forEach { char ->
                previous?.let { if (char.xDirAdj - (it.xDirAdj + it.widthDirAdj) > maxOf(1f, char.widthOfSpace * .4f)) value.append(' ') }
                value.append(char.unicode); previous = char
            }
            return MenuExtractor.clean(value.toString())
        }
        val lines = rows.sortedBy { it.y }.map { row ->
            val body = row.chars.filter { it.xDirAdj < pageWidth * .85f }
            Line(line(body), row.y, body.any { it.unicode.any(Char::isLetter) && it.font.name.contains("Bold", true) })
        }
        val heading = lines.firstOrNull { it.text == "HAUPTGÄNGE" } ?: return emptyList()
        val dessert = lines.firstOrNull { it.text == "DESSERT" && it.y > heading.y } ?: return emptyList()
        val footer = lines.firstOrNull { it.y > dessert.y && it.text.startsWith("Preise in CHF") } ?: return emptyList()
        val dessertTitle = lines.firstOrNull { it.y > dessert.y && it.y < footer.y && it.text.isNotBlank() }
        val titles = lines.filter { it.y > heading.y && it.y < dessert.y && it.bold && it.text.isNotBlank() } +
            listOfNotNull(dessertTitle?.copy(text = dessertTitle.text.substringBefore('.')))
        val meals = mutableListOf<Meal>()
        titles.forEachIndexed { i, title ->
            val isDessert = title.y > dessert.y
            val end = if (isDessert) footer.y else minOf(titles.getOrNull(i + 1)?.y ?: dessert.y, dessert.y)
            val block = rows.filter { it.y >= title.y && it.y < end }
            val prices = block.mapNotNull { row -> price.find(line(row.chars.filter { it.xDirAdj >= pageWidth * .85f })) }
            if (prices.size != 1) return@forEachIndexed
            val match = prices.single()
            val amount = match.groupValues[1].toDouble() + (match.groupValues[2].toIntOrNull() ?: 0) / 100.0
            val body = lines.filter { it.y > title.y && it.y < end && it.text.isNotBlank() }
            val diets = if (body.any { it.text.contains("vegetarisch", true) }) listOf("Vegetarian") else emptyList()
            val description = body.filterNot { it.text.contains("vegetarisch", true) }.joinToString(" ") { it.text }
            val evidence = dates.value + "\n" + block.joinToString("\n") { line(it.chars) }
            var date = from
            while (date <= to) {
                val key = "${URI(url).host}|$date|${title.text}|$amount"
                val id = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).take(10).joinToString("") { "%02x".format(it) }
                meals += Meal(id, title.text, description, MealPrice(amount, "CHF"), if (isDessert) "Dessert" else "Mittagsmenü",
                    diets, url, page, evidence, "bellavista-weekly-pdf", date.toString())
                date = date.plusDays(1)
            }
        }
        return meals
    }
}
