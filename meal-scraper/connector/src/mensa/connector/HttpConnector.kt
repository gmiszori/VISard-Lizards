package mensa.connector

import com.sun.net.httpserver.HttpServer
import com.sun.net.httpserver.HttpExchange
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import mensa.PublicWebFetcher
import mensa.mealJson
import mensa.MensaSources
import kotlinx.serialization.encodeToString
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.util.concurrent.Executors

class HttpConnector(
    address: InetSocketAddress, private val connection: ToolConnection, private val token: String? = null,
    private val allowedOrigins: Set<String> = emptySet(),
) : AutoCloseable {
    private val server = HttpServer.create(address, 32)
    private val executor = Executors.newFixedThreadPool(4)
    private val relay = AiToolRelay(connection)
    val port: Int get() = server.address.port
    init {
        require(address.address.isLoopbackAddress || !token.isNullOrBlank()) { "MEAL_CONNECTOR_TOKEN is required when binding outside loopback." }
        server.executor = executor
        server.createContext("/") { exchange -> handle(exchange) }
    }
    fun start() = server.start()
    override fun close() { server.stop(1); executor.shutdownNow() }

    private fun handle(exchange: HttpExchange) {
        try {
            val origin = exchange.requestHeaders.getFirst("Origin")
            if (origin != null) {
                exchange.responseHeaders.set("Vary", "Origin")
                val sameOrigin = origin == "http://${exchange.requestHeaders.getFirst("Host")}"
                if (!sameOrigin && origin !in allowedOrigins) { respond(exchange, 403, error("Origin is not allowed.")); return }
                exchange.responseHeaders.set("Access-Control-Allow-Origin", origin)
            }
            if (exchange.requestMethod == "OPTIONS") {
                val method = allowedMethod(exchange.requestURI.path)
                if (method == null) { respond(exchange, 404, error("Route not found.")); return }
                if (origin == null || exchange.requestHeaders.getFirst("Access-Control-Request-Method") != method) {
                    respond(exchange, 400, error("Invalid CORS preflight.")); return
                }
                val headers = exchange.requestHeaders.getFirst("Access-Control-Request-Headers").orEmpty().split(',')
                    .map { it.trim().lowercase() }.filter { it.isNotEmpty() }
                if (headers.any { it !in setOf("authorization", "content-type") }) {
                    respond(exchange, 400, error("Unsupported CORS request header.")); return
                }
                exchange.responseHeaders.set("Access-Control-Allow-Methods", method)
                exchange.responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
                exchange.sendResponseHeaders(204, -1); return
            }
            val asset = when (exchange.requestURI.path) {
                "/" -> "index.html" to "text/html"
                "/app.js" -> "app.js" to "text/javascript"
                "/client.mjs" -> "client.mjs" to "text/javascript"
                "/styles.css" -> "styles.css" to "text/css"
                else -> null
            }
            // Public source metadata, just like the test page; no scraping or credentials involved.
            if (exchange.requestURI.path == "/api/mensas") {
                if (exchange.requestMethod != "GET") { methodNotAllowed(exchange, "GET"); return }
                respond(exchange, 200, buildJsonObject {
                    put("locations", mealJson.parseToJsonElement(mealJson.encodeToString(MensaSources.locations)))
                }); return
            }
            if (asset != null) {
                if (exchange.requestMethod != "GET") { methodNotAllowed(exchange, "GET"); return }
                val bytes = HttpConnector::class.java.getResourceAsStream("/web/${asset.first}")?.use { it.readBytes() }
                    ?: throw IllegalStateException("Test page resource is missing.")
                exchange.responseHeaders.set("Content-Type", "${asset.second}; charset=utf-8")
                exchange.responseHeaders.set("Cache-Control", "no-store")
                exchange.responseHeaders.set("X-Content-Type-Options", "nosniff")
                exchange.responseHeaders.set("Content-Security-Policy", "default-src 'self'; connect-src 'self' https://api.openai.com; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }; return
            }
            if (token != null && !MessageDigest.isEqual(exchange.requestHeaders.getFirst("Authorization").orEmpty().toByteArray(), "Bearer $token".toByteArray())) {
                exchange.responseHeaders.set("WWW-Authenticate", "Bearer")
                respond(exchange, 401, error("Unauthorized.")); return
            }
            val path = exchange.requestURI.path
            if (path == "/health") {
                if (exchange.requestMethod != "GET") { methodNotAllowed(exchange, "GET"); return }
                val ready = connection.isReady()
                respond(exchange, if (ready) 200 else 503, buildJsonObject { put("status", if (ready) "ready" else "unavailable"); put("mcpConnected", ready) }); return
            }
            if (path == "/api/ai/tools") {
                if (exchange.requestMethod != "GET") { methodNotAllowed(exchange, "GET"); return }
                if (!connection.isReady()) { respond(exchange, 503, error("MCP server unavailable; restart the connector.")); return }
                respond(exchange, 200, relay.definitions()); return
            }
            val tool = when (path) {
                "/api/meals/scrape" -> "scrape_meals"
                "/api/menus/discover" -> "discover_menu_sources"
                "/api/menus/read" -> "read_menu_source"
                "/api/ai/tools/call" -> null
                else -> { respond(exchange, 404, error("Route not found.")); return }
            }
            if (exchange.requestMethod != "POST") { methodNotAllowed(exchange, "POST"); return }
            if (exchange.requestHeaders.getFirst("Content-Type")?.substringBefore(';')?.trim()?.lowercase() != "application/json") {
                respond(exchange, 415, error("Content-Type must be application/json.")); return
            }
            val bytes = exchange.requestBody.readNBytes(16_385)
            if (bytes.size > 16_384) { respond(exchange, 413, error("Request exceeds 16 KiB.")); return }
            val body = mealJson.parseToJsonElement(bytes.decodeToString()) as? JsonObject ?: throw IllegalArgumentException("Expected a JSON object.")
            if (!connection.isReady()) { respond(exchange, 503, error("MCP server unavailable; restart the connector.")); return }
            if (path == "/api/ai/tools/call") {
                val result = runBlocking { withTimeout(240_000) { relay.execute(body) } }
                respond(exchange, 200, result); return
            }
            require(body.keys == setOf("url")) { "Only url is accepted." }
            val urlValue = body["url"] as? JsonPrimitive
            require(urlValue?.isString == true) { "url must be a string." }
            val url = PublicWebFetcher.validateUrl(urlValue.content)
            if (!connection.isReady()) { respond(exchange, 503, error("MCP server unavailable; restart the connector.")); return }
            // Timeout includes waiting for the dedicated client. The HTTP response is the MCP JSON itself.
            val result = runBlocking { withTimeout(240_000) { connection.call(requireNotNull(tool), url) } }
            respond(exchange, 200, result)
        } catch (ex: ToolFailure) { respond(exchange, 502, ex.json) }
        catch (_: TimeoutCancellationException) { respond(exchange, 504, error("Scraping request timed out.")) }
        catch (ex: IllegalArgumentException) { respond(exchange, 400, error(ex.message ?: "Invalid request.")) }
        catch (ex: Exception) {
            System.err.println("Connector request failed: ${ex.message}")
            respond(exchange, 502, error("MCP request failed."))
        } finally { exchange.close() }
    }
    private fun allowedMethod(path: String): String? = when (path) {
        "/", "/app.js", "/client.mjs", "/styles.css", "/api/mensas", "/health", "/api/ai/tools" -> "GET"
        "/api/meals/scrape", "/api/menus/discover", "/api/menus/read", "/api/ai/tools/call" -> "POST"
        else -> null
    }
    private fun methodNotAllowed(exchange: HttpExchange, method: String) {
        exchange.responseHeaders.set("Allow", method); respond(exchange, 405, error("Method not allowed."))
    }
    private fun error(message: String) = buildJsonObject { put("error", message) }
    private fun respond(exchange: HttpExchange, status: Int, json: JsonObject) {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        exchange.responseHeaders.set("Content-Type", "application/json; charset=utf-8")
        exchange.responseHeaders.set("Cache-Control", "no-store")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
