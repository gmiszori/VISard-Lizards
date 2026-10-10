package mensa.connector

import kotlin.test.*
import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.*

class HttpConnectorTest {
    private val client = HttpClient.newHttpClient()
    private fun request(server: HttpConnector, path: String, body: String? = null, token: String? = null): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI("http://127.0.0.1:${server.port}$path"))
        if (token != null) builder.header("Authorization", "Bearer $token")
        if (body != null) builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body))
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }
    @Test fun routesDirectToolCallsAndReturnsRawJson() {
        val calls = mutableListOf<Pair<String, String>>()
        val connection = object : ToolConnection {
            override fun isReady() = true
            override suspend fun call(tool: String, url: String, date: java.time.LocalDate?): JsonObject {
                calls += tool to url
                return buildJsonObject { put("status", "meals_found"); put("meals", JsonArray(emptyList())) }
            }
        }
        HttpConnector(InetSocketAddress("127.0.0.1", 0), connection).use { server ->
            server.start()
            assertEquals(200, request(server, "/health").statusCode())
            val result = request(server, "/api/meals/scrape", """{"url":"https://bqm-bar.ch/de"}""")
            assertEquals(200, result.statusCode()); assertTrue(result.body().contains("meals_found")); assertFalse(result.body().contains("structuredContent"))
            request(server, "/api/menus/discover", """{"url":"https://bqm-bar.ch/de"}""")
            request(server, "/api/menus/read", """{"url":"https://bqm-bar.ch/de"}""")
            assertEquals(listOf("scrape_meals", "discover_menu_sources", "read_menu_source"), calls.map { it.first })
            assertEquals(405, request(server, "/api/meals/scrape").statusCode())
            assertEquals(404, request(server, "/unknown").statusCode())
            assertEquals(400, request(server, "/api/meals/scrape", "not-json").statusCode())
            assertEquals(400, request(server, "/api/meals/scrape", """{"url":"https://localhost"}""").statusCode())
            assertEquals(400, request(server, "/api/meals/scrape", """{"url":10}""").statusCode())
            assertEquals(413, request(server, "/api/meals/scrape", "x".repeat(16385)).statusCode())
            assertEquals(3, calls.size)
        }
    }
    @Test fun authReadinessAndToolErrorsAreVisible() {
        val connection = object : ToolConnection {
            var ready = false
            override fun isReady() = ready
            override suspend fun call(tool: String, url: String, date: java.time.LocalDate?): JsonObject = throw ToolFailure(buildJsonObject { put("error", "Source unavailable") })
        }
        HttpConnector(InetSocketAddress("127.0.0.1", 0), connection, "secret").use { server ->
            server.start()
            assertEquals(401, request(server, "/health").statusCode())
            assertEquals(503, request(server, "/health", token = "secret").statusCode())
            connection.ready = true
            val result = request(server, "/api/meals/scrape", """{"url":"https://example.com"}""", "secret")
            assertEquals(502, result.statusCode()); assertTrue(result.body().contains("Source unavailable"))
        }
    }
}
