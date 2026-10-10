package mensa

import kotlinx.serialization.json.*
import org.jsoup.nodes.Document

/** Decode streamed React Flight JSON; never execute page scripts. */
class Food2050Data(doc: Document) {
    val records = mutableMapOf<String, JsonElement>()
    init {
        val stream = StringBuilder()
        for (script in doc.select("script")) {
            val match = Regex("self\\.__next_f\\.push\\((.*)\\)", RegexOption.DOT_MATCHES_ALL).find(script.data()) ?: continue
            val chunk = runCatching { mealJson.parseToJsonElement(match.groupValues[1]) as? JsonArray }.getOrNull() ?: continue
            if ((chunk.firstOrNull() as? JsonPrimitive)?.content == "1") stream.append((chunk.getOrNull(1) as? JsonPrimitive)?.content.orEmpty())
        }
        stream.lines().forEach { line ->
            val separator = line.indexOf(':')
            if (separator > 0) runCatching { mealJson.parseToJsonElement(line.substring(separator + 1)) }.getOrNull()?.let { records[line.substring(0, separator)] = it }
        }
    }
    fun resolve(value: JsonElement?, depth: Int = 0): JsonElement? {
        if (depth > 30) return null
        val ref = (value as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return value
        if (!ref.startsWith('$') || ref.startsWith("$$")) return value
        val parts = ref.removePrefix("$").split(':')
        var current = records[parts[0]] ?: return null
        for (part in parts.drop(1)) {
            current = resolve(current, depth + 1) ?: return null
            current = when (current) {
                is JsonObject -> current[part]
                is JsonArray -> if (part == "props") current.getOrNull(3) else part.toIntOrNull()?.let { current.getOrNull(it) }
                else -> null
            } ?: return null
        }
        return resolve(current, depth + 1)
    }
    fun expand(value: JsonElement?, depth: Int = 0): JsonElement {
        if (depth > 30) return JsonNull
        return when (val resolved = resolve(value)) {
            is JsonObject -> JsonObject(resolved.mapValues { expand(it.value, depth + 1) })
            is JsonArray -> JsonArray(resolved.map { expand(it, depth + 1) })
            else -> resolved ?: JsonNull
        }
    }
    fun objects(): Sequence<JsonObject> {
        fun walk(node: JsonElement): Sequence<JsonObject> = sequence {
            when (node) {
                is JsonObject -> { yield(node); node.values.forEach { yieldAll(walk(it)) } }
                is JsonArray -> node.forEach { yieldAll(walk(it)) }
                else -> Unit
            }
        }
        return records.values.asSequence().flatMap { walk(it) }
    }
}
