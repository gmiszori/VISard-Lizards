package mensa.connector

import kotlinx.serialization.json.*
import mensa.PublicWebFetcher
import mensa.mealJson

/** Adapts frontend OpenAI function calls to the dedicated MCP connection. No AI credentials or model calls. */
class AiToolRelay(private val connection: ToolConnection) {
    fun definitions(): JsonObject = buildJsonObject {
        put("api", "responses")
        put("tools", JsonArray(connection.definitions().map { tool -> buildJsonObject {
            put("type", "function"); put("name", tool.name); put("description", tool.description)
            put("parameters", tool.parameters); put("strict", true)
        } }))
    }

    suspend fun execute(body: JsonObject): JsonObject {
        require(body.keys.all { it in setOf("type", "id", "status", "call_id", "name", "arguments") }) { "Unsupported tool-call field." }
        body["type"]?.let { require(it == JsonPrimitive("function_call")) { "Expected a function_call." } }
        val callId = string(body, "call_id")
        require(callId.matches(Regex("[A-Za-z0-9_-]{1,64}"))) { "Invalid call_id." }
        val name = string(body, "name")
        require(connection.definitions().any { it.name == name }) { "Unknown MCP tool." }
        val arguments = when (val args = body["arguments"]) {
            is JsonObject -> args
            is JsonPrimitive -> {
                require(args.isString) { "arguments must be an object or JSON-encoded object." }
                mealJson.parseToJsonElement(args.content) as? JsonObject ?: throw IllegalArgumentException("arguments must encode an object.")
            }
            else -> throw IllegalArgumentException("arguments are required.")
        }
        val date = mensa.menuDate(arguments)
        val url = PublicWebFetcher.validateUrl(string(arguments, "url"))
        val result = try { connection.call(name, url, date) } catch (ex: ToolFailure) { ex.json }
        return buildJsonObject {
            put("type", "function_call_output"); put("call_id", callId); put("output", result.toString())
        }
    }
    private fun string(objectValue: JsonObject, field: String): String {
        val value = objectValue[field] as? JsonPrimitive
        require(value?.isString == true) { "$field must be a string." }
        return value.content
    }
}
