package mensa.connector

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import mensa.mealJson
import kotlin.test.*

class AiToolRelayTest {
    private class Connection : ToolConnection {
        val calls = mutableListOf<Pair<String, String>>()
        var fail = false
        override fun isReady() = true
        override fun definitions() = listOf(ModelTool("scrape_meals", "Scrape meals", buildJsonObject {
            put("type", "object"); put("additionalProperties", false)
            put("required", JsonArray(listOf(JsonPrimitive("url"))))
            put("properties", buildJsonObject { put("url", buildJsonObject { put("type", "string") }) })
        }))
        override suspend fun call(tool: String, url: String): JsonObject {
            calls += tool to url
            if (fail) throw ToolFailure(buildJsonObject { put("error", "Source is unavailable") })
            return buildJsonObject { put("status", "meals_found"); put("meals", JsonArray(emptyList())) }
        }
    }
    private fun body(arguments: JsonElement = buildJsonObject { put("url", "https://bqm-bar.ch/de") }) = buildJsonObject {
        put("name", "scrape_meals"); put("call_id", "call_123"); put("arguments", arguments)
    }
    @Test fun definitionsAreOpenAiResponsesFunctionsFromMcp() {
        val tools = AiToolRelay(Connection()).definitions()["tools"]!!.jsonArray
        val tool = tools.single().jsonObject
        assertEquals("function", tool["type"]!!.jsonPrimitive.content)
        assertEquals("scrape_meals", tool["name"]!!.jsonPrimitive.content)
        assertTrue(tool["strict"]!!.jsonPrimitive.boolean)
        assertEquals(false, tool["parameters"]!!.jsonObject["additionalProperties"]!!.jsonPrimitive.boolean)
    }
    @Test fun objectArgumentsReturnMatchingCallIdAndJsonOutput() = runBlocking {
        val connection = Connection()
        val output = AiToolRelay(connection).execute(body())
        assertEquals("function_call_output", output["type"]!!.jsonPrimitive.content)
        assertEquals("call_123", output["call_id"]!!.jsonPrimitive.content)
        assertEquals("meals_found", mealJson.parseToJsonElement(output["output"]!!.jsonPrimitive.content).jsonObject["status"]!!.jsonPrimitive.content)
        assertEquals(listOf("scrape_meals" to "https://bqm-bar.ch/de"), connection.calls)
    }
    @Test fun rawResponsesFunctionCallAcceptsStringArgumentsAndMetadata() = runBlocking {
        val connection = Connection()
        val raw = buildJsonObject {
            body(JsonPrimitive("""{"url":"https://bqm-bar.ch/de"}""")).forEach { (key, value) -> put(key, value) }
            put("type", "function_call"); put("id", "fc_123"); put("status", "completed")
        }
        AiToolRelay(connection).execute(raw)
        assertEquals(1, connection.calls.size)
    }
    @Test fun mcpFailureIsAFunctionOutputTheModelCanRead() = runBlocking {
        val connection = Connection().apply { fail = true }
        val output = AiToolRelay(connection).execute(body())
        assertEquals("Source is unavailable", mealJson.parseToJsonElement(output["output"]!!.jsonPrimitive.content).jsonObject["error"]!!.jsonPrimitive.content)
    }
    @Test fun invalidCallsNeverReachMcp() = runBlocking {
        val connection = Connection(); val relay = AiToolRelay(connection)
        val invalid = listOf(
            body(JsonPrimitive("not-json")), body(JsonPrimitive("[]")), body(JsonPrimitive(1)),
            body(buildJsonObject { put("url", "https://localhost") }),
            body(buildJsonObject { put("url", 12) }),
            body(buildJsonObject { put("url", "https://example.com"); put("command", "run") }),
            JsonObject(body() + ("name" to JsonPrimitive("execute_shell"))),
            JsonObject(body() + ("call_id" to JsonPrimitive(""))),
            JsonObject(body() + ("type" to JsonPrimitive("mcp_call"))),
            JsonObject(body() + ("apiKey" to JsonPrimitive("not-a-real-key"))),
        )
        invalid.forEach { assertFailsWith<IllegalArgumentException> { relay.execute(it) } }
        assertTrue(connection.calls.isEmpty())
    }
}
