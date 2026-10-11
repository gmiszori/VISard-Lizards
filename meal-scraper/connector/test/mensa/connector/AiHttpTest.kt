package mensa.connector

import kotlin.test.*
import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.*

class AiHttpTest {
    private val client = HttpClient.newHttpClient()
    @Test fun frontendCanDiscoverAndExecuteToolsAfterPreflight() {
        val connection = object : ToolConnection {
            var calls = 0
            override fun isReady() = true
            override fun definitions() = listOf(ModelTool("scrape_meals", "Meals", buildJsonObject {}))
            override suspend fun call(tool: String, url: String, date: java.time.LocalDate?): JsonObject {
                calls++; return buildJsonObject { put("status", "meals_found") }
            }
        }
        HttpConnector(InetSocketAddress("127.0.0.1", 0), connection, "relay-secret", setOf("http://localhost:5173")).use { server ->
            server.start()
            fun request(path: String, method: String, body: String = "", origin: String = "http://localhost:5173", auth: Boolean = true): HttpResponse<String> {
                val builder = HttpRequest.newBuilder(URI("http://127.0.0.1:${server.port}$path")).header("Origin", origin)
                    .method(method, if (method == "POST") HttpRequest.BodyPublishers.ofString(body) else HttpRequest.BodyPublishers.noBody())
                if (auth) builder.header("Authorization", "Bearer relay-secret")
                if (method == "POST") builder.header("Content-Type", "application/json")
                if (method == "OPTIONS") builder.header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Content-Type,Authorization")
                return client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
            }
            val preflight = request("/api/ai/tools/call", "OPTIONS", auth = false)
            assertEquals(204, preflight.statusCode())
            assertEquals("http://localhost:5173", preflight.headers().firstValue("Access-Control-Allow-Origin").orElseThrow())
            val definitions = request("/api/ai/tools", "GET")
            assertEquals(200, definitions.statusCode()); assertTrue(definitions.body().contains("scrape_meals"))
            assertEquals(401, request("/api/ai/tools", "GET", auth = false).statusCode())
            assertEquals(403, request("/api/ai/tools", "GET", origin = "https://untrusted.example").statusCode())
            assertEquals(405, request("/api/ai/tools/call", "GET").statusCode())
            val result = request("/api/ai/tools/call", "POST", """{"call_id":"call_1","name":"scrape_meals","arguments":{"url":"https://bqm-bar.ch/de"}}""")
            assertEquals(200, result.statusCode()); assertTrue(result.body().contains("function_call_output")); assertEquals(1, connection.calls)
            assertEquals(400, request("/api/ai/tools/call", "POST", "{}").statusCode())
        }
    }
    @Test fun missingContentTypeAndUnavailableMcpAreReported() {
        val connection = object : ToolConnection {
            override fun isReady() = false
            override suspend fun call(tool: String, url: String, date: java.time.LocalDate?): JsonObject = error("Should not be called")
        }
        HttpConnector(InetSocketAddress("127.0.0.1", 0), connection).use { server ->
            server.start()
            val unavailable = client.send(HttpRequest.newBuilder(URI("http://127.0.0.1:${server.port}/api/ai/tools")).build(), HttpResponse.BodyHandlers.ofString())
            assertEquals(503, unavailable.statusCode())
            val wrongType = client.send(HttpRequest.newBuilder(URI("http://127.0.0.1:${server.port}/api/ai/tools/call"))
                .POST(HttpRequest.BodyPublishers.ofString("{}")).build(), HttpResponse.BodyHandlers.ofString())
            assertEquals(415, wrongType.statusCode())
        }
    }
}
