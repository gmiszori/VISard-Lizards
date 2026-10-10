package mensa

import org.jsoup.nodes.Document
import java.time.LocalDate

/** Explicit closure notices only: absence of meals is never evidence of closure. */
object VenueAvailability {
    private val numeric = Regex("(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})\\s*(?:bis|[-–])\\s*(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", RegexOption.IGNORE_CASE)
    private val named = Regex("(\\d{1,2})\\.?\\s*[-–]\\s*(\\d{1,2})\\.\\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+(\\d{4})", RegexOption.IGNORE_CASE)
    private val months = listOf("januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember")
    fun extract(doc: Document, url: String): List<AvailabilityNotice> = doc.select("p, h1, h2, h3, h4, li")
        .map { MenuExtractor.clean(it.text()) }.filter { it.contains("geschlossen", true) }
        .mapNotNull { text ->
            val dates = runCatching {
                numeric.find(text)?.let { m ->
                    LocalDate.of(m.groupValues[3].toInt(), m.groupValues[2].toInt(), m.groupValues[1].toInt()) to
                        LocalDate.of(m.groupValues[6].toInt(), m.groupValues[5].toInt(), m.groupValues[4].toInt())
                } ?: named.find(text)?.let { m ->
                    val month = months.indexOf(m.groupValues[3].lowercase()) + 1
                    LocalDate.of(m.groupValues[4].toInt(), month, m.groupValues[1].toInt()) to
                        LocalDate.of(m.groupValues[4].toInt(), month, m.groupValues[2].toInt())
                }
            }.getOrNull()
            when {
                dates != null && dates.first <= dates.second -> AvailabilityNotice(dateFrom = dates.first.toString(), dateTo = dates.second.toString(), evidence = text, sourceUrl = url)
                text.contains("vorübergehend geschlossen", true) || text.contains("bis auf Weiteres geschlossen", true) ->
                    AvailabilityNotice(evidence = text, sourceUrl = url)
                else -> null // Regular weekend opening times or unparseable dates must not imply a continuing closure.
            }
        }.distinctBy { listOf(it.dateFrom, it.dateTo, it.evidence) }
    fun upcoming(notices: List<AvailabilityNotice>, today: LocalDate) = notices.filter {
        it.dateTo == null || LocalDate.parse(it.dateTo) >= today
    }
    fun covers(notice: AvailabilityNotice, date: String?): Boolean {
        if (notice.dateFrom == null && notice.dateTo == null) return true
        return date != null && (notice.dateFrom == null || date >= notice.dateFrom) && (notice.dateTo == null || date <= notice.dateTo)
    }
}
