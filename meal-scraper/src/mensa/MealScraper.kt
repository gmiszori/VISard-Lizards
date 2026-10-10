package mensa

import java.net.URI
import java.time.LocalDate
import java.time.ZoneId

class MealScraper(private val fetch: (String) -> SourceDocument, private val extractor: MenuExtractor = MenuExtractor(),
                  private val today: () -> LocalDate = { LocalDate.now(ZoneId.of("Europe/Zurich")) }) {
    private fun cutoff(date: LocalDate?) = maxOf(today(), date ?: today())
    fun discover(url: String, date: LocalDate? = null): DiscoveryResult {
        val result = extractor.discover(fetch(url))
        return result.copy(availability = VenueAvailability.upcoming(result.availability, cutoff(date)))
    }
    private val details = Food2050Details(fetch)
    fun read(url: String, date: LocalDate? = null): ReadResult {
        val result = readDocument(fetch(url))
        return if (date == null) result else UpcomingMenus.select(result, cutoff(date))
    }
    private fun upcoming(document: SourceDocument, date: LocalDate): ReadResult {
        val uri = URI(document.url)
        if (uri.host == "app.food2050.ch" && (uri.path.endsWith("/menu/weekly") || uri.path.endsWith("/menu/weekly.pdf"))) {
            val firstWeek = UpcomingMenus.firstFoodWeek(document.url, date)
            val weeks = mutableListOf<ReadResult>()
            val failures = mutableListOf<String>()
            for (offset in 0..2) {
                val url = UpcomingMenus.foodWeek(document.url, firstWeek.plusWeeks(offset.toLong()))
                try {
                    val page = if (url == document.url) document else fetch(url)
                    weeks += extractor.read(page)
                } catch (ex: Exception) { failures += "Could not check upcoming menu $url: ${ex.message}" }
            }
            val combined = ReadResult(weeks.firstOrNull()?.url ?: document.url, document.fetchedAt,
                weeks.joinToString("\n") { it.text }.take(12000),
                MenuExtractor.unique(weeks.flatMap { it.meals }),
                (weeks.flatMap { it.warnings } + failures).distinct(),
                weeks.flatMap { it.availability }.distinct())
            val selected = UpcomingMenus.select(combined, date)
            return details.enrich(selected).let {
                if (it.meals.isEmpty()) it.copy(warnings = (it.warnings +
                    "No upcoming meals found in the checked three-week window; past meals were excluded.").distinct()) else it
            }
        }
        if (uri.host == "idapps.ethz.ch" && uri.path == "/cookpit-pub-services/v1/weeklyrotas") {
            val url = UpcomingMenus.ethUpcoming(document.url, date)
            return UpcomingMenus.select(extractor.read(if (url == document.url) document else fetch(url)), date)
        }
        return UpcomingMenus.select(readDocument(document), date)
    }
    private fun readDocument(document: SourceDocument): ReadResult {
        val uri = URI(document.url)
        if (uri.host == "app.food2050.ch" && uri.path.endsWith("/menu/weekly.pdf")) {
            // Some PDF fonts lack Unicode mappings. The matching HTML and details preserve names and price labels.
            val htmlUrl = document.url.replace("/menu/weekly.pdf", "/menu/weekly")
            val result = details.enrich(extractor.read(fetch(htmlUrl)))
            return result.copy(url = document.url, warnings = result.warnings + "Weekly PDF resolved through its matching digital menu; week/year query parameters are preserved.")
        }
        val result = extractor.read(document)
        return if (uri.host == "app.food2050.ch") details.enrich(result) else result
    }
    fun scrape(url: String, date: LocalDate? = null): ScrapeResult {
        val document = fetch(url)
        val from = cutoff(date)
        val root = upcoming(document, from)
        val discovery = if (document.mediaType == "application/pdf" || URI(document.url).host == "app.food2050.ch") null else extractor.discover(document)
        val meals = root.meals.toMutableList()
        val availability = root.availability.toMutableList()
        val warnings = root.warnings.map { "${root.url}: $it" }.toMutableList()
        val sources = mutableListOf(MenuSource(document.url, "Requested source", if (document.mediaType == "application/pdf") "pdf" else "html"))
        discovery?.sources?.filter { it.url != document.url }?.take(6)?.forEach { source ->
            try {
                val result = upcoming(fetch(source.url), from)
                availability += result.availability
                meals += result.meals; warnings += result.warnings.map { "${result.url}: $it" }
                sources += source.copy(url = result.url)
                if (source.label.startsWith("Catering:")) warnings += "${source.url}: Catering offer; these items are not confirmed daily cafeteria meals. Dates and individual availability may be unknown."
            } catch (ex: Exception) { warnings += "Could not read ${source.url}: ${ex.message}" }
        }
        if ((discovery?.sources?.size ?: 0) > 6) warnings += "Only the first six linked menu sources were read."
        val unique = MenuExtractor.unique(meals).filter { meal -> availability.none { VenueAvailability.covers(it, meal.date) } }.sortedWith(compareBy<Meal> { it.date == null }.thenBy { it.date }.thenBy { it.timeStart })
        unique.map { it.sourceUrl }.distinct().filter { url -> sources.none { it.url == url } }.forEach {
            sources += MenuSource(it, "Matching digital menu", "html")
        }
        if (unique.isNotEmpty() || availability.isNotEmpty()) warnings.removeAll { it.startsWith("${root.url}: No supported structured meal entries found.") || it.startsWith("${root.url}: No meals dated today or later") }
        return ScrapeResult(document.url, now(), if (unique.isNotEmpty()) "meals_found" else if (availability.isNotEmpty()) "closure_found" else "no_supported_menu_found",
            unique, sources.distinctBy { it.url }, warnings.distinct(), availability.distinct())
    }
}
