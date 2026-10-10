package mensa.connector

import kotlin.test.*
import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.*

class TestWebsiteTest {
    @Test fun staticPageLoadsWithoutTokenAndSameOriginPostWorks() {
        val connection = object : ToolConnection {
            override fun isReady() = true
            override fun definitions() = listOf(ModelTool("scrape_meals", "Meals", buildJsonObject {}))
            override suspend fun call(tool: String, url: String, date: java.time.LocalDate?) = buildJsonObject { put("meals", JsonArray(emptyList())) }
        }
        HttpConnector(InetSocketAddress("127.0.0.1", 0), connection, "test-token").use { server ->
            server.start()
            val client = HttpClient.newHttpClient()
            val origin = "http://127.0.0.1:${server.port}"
            val catalog = client.send(HttpRequest.newBuilder(URI("$origin/api/mensas")).build(), HttpResponse.BodyHandlers.ofString())
            assertEquals(200, catalog.statusCode())
            val locations = Json.parseToJsonElement(catalog.body()).jsonObject["locations"]!!.jsonArray
            assertEquals(22, locations.size)
            assertTrue(locations.any { it.jsonObject["name"]!!.jsonPrimitive.content == "Irchel Bar" })
            for ((path, contentType) in listOf("/" to "text/html", "/app.js" to "text/javascript", "/client.mjs" to "text/javascript", "/styles.css" to "text/css")) {
                val response = client.send(HttpRequest.newBuilder(URI("$origin$path")).build(), HttpResponse.BodyHandlers.ofString())
                assertEquals(200, response.statusCode(), path)
                assertTrue(response.headers().firstValue("Content-Type").orElseThrow().startsWith(contentType))
                assertEquals("no-store", response.headers().firstValue("Cache-Control").orElseThrow())
                assertTrue(response.headers().firstValue("Content-Security-Policy").orElseThrow().contains("https://api.openai.com"))
            }
            val request = HttpRequest.newBuilder(URI("$origin/api/ai/tools/call"))
                .header("Origin", origin).header("Authorization", "Bearer test-token").header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"call_id":"call_1","name":"scrape_meals","arguments":{"url":"https://bqm-bar.ch/de"}}""")).build()
            assertEquals(200, client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode())
            val anonymous = client.send(HttpRequest.newBuilder(URI("$origin/api/ai/tools")).build(), HttpResponse.BodyHandlers.ofString())
            assertEquals(401, anonymous.statusCode())
        }
    }
}
