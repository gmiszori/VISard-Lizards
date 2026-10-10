package mensa

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields

object UpcomingMenus {
    fun monday(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    fun query(url: String): Map<String, String> = URI(url).rawQuery.orEmpty().split('&').filter { it.isNotBlank() }.associate {
        val parts = it.split('=', limit = 2)
        URLDecoder.decode(parts[0], StandardCharsets.UTF_8) to URLDecoder.decode(parts.getOrElse(1) { "" }, StandardCharsets.UTF_8)
    }
    private fun replaceQuery(url: String, replacements: Map<String, String>): String {
        val retained = URI(url).rawQuery.orEmpty().split('&').filter { it.isNotBlank() && URLDecoder.decode(it.substringBefore('='), StandardCharsets.UTF_8) !in replacements }
        return url.substringBefore('?').substringBefore('#') + "?" + (retained + replacements.map { "${it.key}=${it.value}" }).joinToString("&")
    }
    fun firstFoodWeek(url: String, today: LocalDate): LocalDate {
        val query = query(url)
        val week = query["week"]?.toLongOrNull()
        val year = query["year"]?.toIntOrNull()
        val requested = if (week != null && week in 1..53 && year != null && year in 1900..9998)
            monday(LocalDate.of(year, 1, 4)).plusWeeks(week - 1) else null
        return if (requested != null && requested >= monday(today)) requested else monday(today)
    }
    fun foodWeek(url: String, monday: LocalDate): String = replaceQuery(url.replace("/menu/weekly.pdf", "/menu/weekly"),
        mapOf("week" to monday.get(WeekFields.ISO.weekOfWeekBasedYear()).toString(), "year" to monday.get(WeekFields.ISO.weekBasedYear()).toString()))
    fun ethUpcoming(url: String, today: LocalDate): String = replaceQuery(url,
        mapOf("valid-after" to today.toString(), "valid-before" to monday(today).plusWeeks(3).toString()))
    fun select(result: ReadResult, today: LocalDate): ReadResult {
        val availability = VenueAvailability.upcoming(result.availability, today)
        val meals = result.meals.filter { meal -> meal.date == null || runCatching { LocalDate.parse(meal.date) >= today }.getOrDefault(false) }
            .filter { meal -> availability.none { VenueAvailability.covers(it, meal.date) } }
            .sortedWith(compareBy<Meal> { it.date == null }.thenBy { it.date }.thenBy { it.timeStart })
        val warning = if (meals.isEmpty()) listOf("No meals dated today or later are published in this source.")
            else if (meals.none { it.date == today.toString() } && meals.any { it.date != null }) listOf("No meals are published for today ($today); showing the next published meals from ${meals.first { it.date != null }.date}.") else emptyList()
        return result.copy(meals = meals, availability = availability, warnings = (result.warnings + warning + availability.map { "Published closure: ${it.dateFrom ?: "start unknown"} to ${it.dateTo ?: "until further notice"}: ${it.evidence}" }).distinct())
    }
}
