package mensa

import java.time.LocalDate
import kotlinx.serialization.json.*

/** Shared validation for HTTP and MCP requests. Null/omitted dates use Zurich today. */
fun menuDate(arguments: JsonObject): LocalDate? {
    require(arguments.keys.all { it in setOf("url", "date") } && "url" in arguments) { "Only url and date are accepted; url is required." }
    val value = arguments["date"] ?: return null
    if (value == JsonNull) return null
    require(value is JsonPrimitive && value.isString && Regex("\\d{4}-\\d{2}-\\d{2}").matches(value.content)) { "date must be YYYY-MM-DD or null." }
    return try { LocalDate.parse(value.content) } catch (_: Exception) { throw IllegalArgumentException("date must be a valid YYYY-MM-DD date.") }
}
