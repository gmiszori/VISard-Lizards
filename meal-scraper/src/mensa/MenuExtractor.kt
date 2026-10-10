package mensa

import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.pdfbox.text.TextPosition
import java.net.URI
import java.security.MessageDigest
import java.math.BigDecimal

class MenuExtractor {
    private val menuLink = Regex("(?i)(speise|men[uü]|menue|food|essen|lunch|dinner|snack|catering)")
    private val priceEnd = Regex("\\s+(?:CHF\\s*)?(\\d{1,3}[.,]\\d{2})(?:\\s*CHF)?\\s*$")
    private val dietLine = Regex("(?i)^(Vegan|Vegetarian|Gluten Free)(,\\s*(Vegan|Vegetarian|Gluten Free))*$")

    fun discover(source: SourceDocument): DiscoveryResult {
        val doc = Jsoup.parse(source.bytes.inputStream(), null, source.url)
        val links = mutableListOf<MenuSource>()
        CampusMenus.ethSource(doc, source.url)?.let { links += it }
        fun add(href: String, label: String) {
            val uri = runCatching { URI(source.url).resolve(href) }.getOrNull() ?: return
            if (uri.scheme != "https" || !menuLink.containsMatchIn(label + " " + uri.path)) return
            val url = uri.toString().substringBefore('#')
            if (url == source.url.substringBefore('#') || Regex("(?i)\\.(jpg|jpeg|png|gif|svg|webp)$").containsMatchIn(uri.path)) return
            links += MenuSource(url, clean(label), if (uri.path.endsWith(".pdf", true)) "pdf" else "html")
        }
        // Scope ZFV links to this venue: catering PDFs live under #events on current pages.
        val zfvVenue = URI(source.url).host in setOf("www.zfv.ch", "zfv.ch") && URI(source.url).path.startsWith("/de/essen-gehen/")
        val scopes = if (zfvVenue) doc.select("#menu, #catering, #events").toList() else listOf(doc)
        scopes.forEach { scope ->
            val catering = zfvVenue && scope.id() in setOf("catering", "events")
            scope.select("a[href]").forEach { link ->
                val href = link.attr("href")
                if (!catering || runCatching { URI(href).path.endsWith(".pdf", true) }.getOrDefault(false))
                    add(href, if (catering) "Catering: ${link.text()}" else link.text())
            }
            if (!catering) scope.select("iframe[src]").forEach { add(it.attr("src"), if (zfvVenue) "Embedded menu" else it.attr("title")) }
        }
        // Nuxt embeds navigation links in JSON instead of rendered anchors.
        if (!zfvVenue) doc.select("script[type=application/json]").forEach { script ->
            runCatching { mealJson.parseToJsonElement(script.data()) }.getOrNull()?.let { json ->
                strings(json).filter { it.contains(".pdf", true) }.forEach { add(it, "Menu PDF") }
            }
        }
        doc.select("script,style,nav,footer,form").remove()
        val text = clean(doc.body().text())
        return DiscoveryResult(source.url, clean(doc.selectFirst("h1")?.text() ?: doc.title()), source.fetchedAt,
            links.distinctBy { it.url }.take(20), text.take(8000),
            if (text.length > 8000) listOf("Page text truncated to 8000 characters.") else emptyList(), VenueAvailability.extract(doc, source.url))
    }

    fun read(source: SourceDocument): ReadResult {
        if (URI(source.url).host == "idapps.ethz.ch" && URI(source.url).path == "/cookpit-pub-services/v1/weeklyrotas")
            return CampusMenus.eth(source)
        if (source.mediaType == "application/pdf" || source.bytes.take(5).toByteArray().decodeToString() == "%PDF-")
            return readPdf(source)
        val doc = Jsoup.parse(source.bytes.inputStream(), null, source.url)
        if (URI(source.url).host == "app.food2050.ch") return CampusMenus.food2050(doc, source)
        val meals = mutableListOf<Meal>()
        val warnings = mutableListOf<String>()
        fun walk(node: JsonElement, parentSection: String?) {
            if (node is JsonArray) { node.forEach { walk(it, parentSection) }; return }
            if (node !is JsonObject) return
            val types = strings(node["@type"] ?: JsonNull).map { it.substringAfterLast('/') }
            val section = if ("MenuSection" in types) field(node, "name").ifBlank { parentSection } else parentSection
            if ("MenuItem" in types) {
                val name = field(node, "name")
                val offers = node["offers"].let { if (it is JsonArray) it.firstOrNull() else it } as? JsonObject
                val amount = offers?.let { field(it, "price").toDoubleOrNull() }
                val currency = offers?.let { field(it, "priceCurrency") }.orEmpty()
                val price = if (amount != null && amount.isFinite() && amount >= 0 && currency.isNotBlank()) MealPrice(amount, currency) else null
                if (name.isNotBlank()) meals += create(name, field(node, "description").ifBlank { null }, price,
                    section, strings(node["suitableForDiet"] ?: JsonNull), source.url, null,
                    node.toString().take(2000), "json-ld")
            }
            node.values.forEach { walk(it, section) }
        }
        doc.select("script[type=application/ld+json]").forEach {
            try { walk(mealJson.parseToJsonElement(it.data()), null) }
            catch (_: IllegalArgumentException) { warnings += "A JSON-LD block could not be parsed." }
        }
        if (meals.isEmpty()) doc.select("[itemtype$='/MenuItem'], .menu-item, .dish, [data-menu-item]").forEach {
            val name = clean(it.selectFirst("[itemprop=name],h2,h3,h4")?.text().orEmpty())
            val evidence = clean(it.text())
            val match = priceEnd.find(evidence)
            // Currency must appear on this item, not on an unrelated part of the page.
            if (name.isNotBlank() && match != null && evidence.contains("CHF")) meals += create(name, null,
                MealPrice(match.groupValues[1].replace(',', '.').toDouble(), "CHF"), null, emptyList(),
                source.url, null, evidence, "html-menu-item")
        }
        doc.select("script,style,nav,footer,form").remove()
        val text = clean(doc.body().text())
        if (meals.isEmpty()) {
            if (URI(source.url).host in setOf("www.zfv.ch", "zfv.ch")) {
                if (text.contains("Aufgrund von Umbauarbeiten vorübergehend geschlossen", true)) warnings += "Venue temporarily closed for renovation; no menu is published."
                else if (doc.selectFirst("#menu") == null) warnings += "This venue's official page publishes no menu link or dish list."
            }
            warnings += "No supported structured meal entries found. Inspect menu links; page text is not confirmed meal data."
        }
        if (text.length > 12000) warnings += "Source text truncated to 12000 characters."
        return ReadResult(source.url, source.fetchedAt, text.take(12000), unique(meals), warnings, VenueAvailability.extract(doc, source.url))
    }

    private fun readPdf(source: SourceDocument): ReadResult {
        val meals = mutableListOf<Meal>()
        val warnings = mutableListOf<String>()
        val evidence = StringBuilder()
        Loader.loadPDF(source.bytes).use { document ->
            if (document.numberOfPages > 30) warnings += "Only the first 30 PDF pages were read."
            for (index in 0 until minOf(30, document.numberOfPages)) {
                val positions = mutableListOf<TextPosition>()
                val stripper = object : PDFTextStripper() {
                    override fun writeString(text: String, textPositions: MutableList<TextPosition>) {
                        positions.addAll(textPositions)
                        super.writeString(text, textPositions)
                    }
                }.apply { startPage = index + 1; endPage = index + 1; sortByPosition = true }
                val text = stripper.getText(document)
                if (evidence.length < 12000) evidence.append("Page ${index + 1}\n$text\n")
                val compact = text.replace(Regex("\\s"), "").uppercase()
                if (!compact.contains("FOOD") || !compact.contains("SNACKS") || !compact.contains("CHF")) continue
                val page = document.getPage(index)
                for (column in 0..1) {
                    data class Row(val y: Float, val chars: MutableList<TextPosition>)
                    val rows = mutableListOf<Row>()
                    positions.filter { (it.xDirAdj < page.mediaBox.width / 2) == (column == 0) }
                        .sortedBy { it.yDirAdj }.forEach { char ->
                            val row = rows.firstOrNull { kotlin.math.abs(it.y - char.yDirAdj) < page.mediaBox.height * .008 }
                            if (row == null) rows += Row(char.yDirAdj, mutableListOf(char)) else row.chars += char
                        }
                    val lines = rows.sortedBy { it.y }.map { row ->
                        val ordered = row.chars.sortedBy { it.xDirAdj }
                        val line = StringBuilder()
                        var previous: TextPosition? = null
                        for (char in ordered) {
                            previous?.let { prev ->
                                if (char.xDirAdj - (prev.xDirAdj + prev.widthDirAdj) > maxOf(1f, char.widthOfSpace * .4f)) line.append(' ')
                            }
                            line.append(char.unicode); previous = char
                        }
                        clean(line.toString())
                    }
                    lines.forEachIndexed { i, line ->
                        val match = priceEnd.find(line) ?: return@forEachIndexed
                        val name = clean(line.substring(0, match.range.first))
                        if (name.length < 2 || name.contains("Prices", true)) return@forEachIndexed
                        val labels = lines.getOrNull(i + 1)?.takeIf { dietLine.matches(it) }
                        meals += create(name, null, MealPrice(match.groupValues[1].replace(',', '.').toDouble(), "CHF"),
                            if (column == 0) "Food" else "Snacks", labels?.split(',')?.map(::clean).orEmpty(),
                            source.url, index + 1, line + (labels?.let { "\n$it" } ?: ""), "two-column-food-pdf")
                    }
                }
            }
        }
        if (meals.isEmpty()) warnings += "PDF text extracted but no supported food layout found. Scanned menus need OCR; other layouts need an adapter."
        else warnings += "Undated food/snack menu: dates, serving times, student/staff prices and allergens remain unknown. Dietary labels quote the source."
        if (evidence.length > 12000) warnings += "Source text truncated to 12000 characters."
        return ReadResult(source.url, source.fetchedAt, evidence.toString().take(12000), unique(meals), warnings)
    }

    private fun create(name: String, description: String?, price: MealPrice?, section: String?, diets: List<String>,
                       url: String, page: Int?, evidence: String, method: String): Meal {
        val amount = price?.let { BigDecimal.valueOf(it.amount).stripTrailingZeros().toPlainString() }.orEmpty()
        val key = "${URI(url).host}|${clean(name).lowercase(java.util.Locale.ROOT)}|$amount|${price?.currency.orEmpty()}|${section.orEmpty()}"
        val id = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).take(10).joinToString("") { "%02x".format(it) }
        return Meal(id, clean(name), description, price, section, diets, url, page, evidence, method)
    }
    companion object {
        fun clean(text: String) = text.replace(Regex("\\s+"), " ").trim()
        fun unique(meals: List<Meal>) = meals.distinctBy { it.id }
        private fun field(node: JsonObject, key: String) = (node[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
        private fun strings(node: JsonElement): List<String> = when (node) {
            is JsonPrimitive -> if (node.isString) listOf(node.content) else emptyList()
            is JsonArray -> node.flatMap(::strings)
            is JsonObject -> node.values.flatMap(::strings)
        }
    }
}
