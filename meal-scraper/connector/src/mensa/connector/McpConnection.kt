package mensa.connector

import io.modelcontextprotocol.kotlin.sdk.client.Client
import io.modelcontextprotocol.kotlin.sdk.client.StdioClientTransport
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.shared.RequestOptions
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.io.asSource
import kotlinx.io.asSink
import kotlinx.io.buffered
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import kotlin.time.Duration.Companion.seconds

interface ToolConnection {
    fun isReady(): Boolean
    fun definitions(): List<ModelTool> = emptyList()
    suspend fun call(tool: String, url: String): JsonObject
}
data class ModelTool(val name: String, val description: String, val parameters: JsonObject)
class ToolFailure(val json: JsonObject) : RuntimeException("The scraping tool failed.")

/** Dedicated MCP client: a fixed server JAR and three fixed tool names. */
class McpConnection(private val jar: Path) : ToolConnection {
    private val mutex = Mutex()
    private val client = Client(Implementation("mensa-http-connector", "1.0.0"))
    private lateinit var process: Process
    @Volatile private var connected = false
    private var advertisedTools: List<ModelTool> = emptyList()
    private val tools = setOf("scrape_meals", "discover_menu_sources", "read_menu_source")

    suspend fun start() {
        require(java.nio.file.Files.isRegularFile(jar)) { "MCP server JAR does not exist: $jar. Package the server first." }
        val java = Path.of(System.getProperty("java.home"), "bin", if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java").toString()
        process = ProcessBuilder(java, "-jar", jar.toAbsolutePath().toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start()
        try {
            withTimeout(20_000) {
                client.connect(StdioClientTransport(process.inputStream.asSource().buffered(), process.outputStream.asSink().buffered()))
                val listed = client.listTools().tools
                check(listed.map { it.name }.toSet() == tools) { "Unexpected MCP tool set." }
                advertisedTools = listed.map { tool ->
                    ModelTool(tool.name, tool.description.orEmpty(), buildJsonObject {
                        put("type", "object")
                        put("properties", tool.inputSchema.properties ?: buildJsonObject {})
                        put("required", kotlinx.serialization.json.JsonArray(tool.inputSchema.required.orEmpty().map { kotlinx.serialization.json.JsonPrimitive(it) }))
                        put("additionalProperties", false)
                    })
                }
                connected = true
            }
        } catch (ex: Exception) { close(); throw ex }
    }
    override fun isReady() = connected && this::process.isInitialized && process.isAlive
    override fun definitions() = advertisedTools
    override suspend fun call(tool: String, url: String): JsonObject = mutex.withLock {
        require(tool in tools) { "Unsupported tool." }
        check(isReady()) { "MCP server is unavailable; restart the connector." }
        val result = client.callTool(tool, mapOf("url" to url), options = RequestOptions(timeout = 240.seconds))
        val json = result.structuredContent ?: error("MCP server did not return structured JSON.")
        if (result.isError == true) throw ToolFailure(json)
        json
    }
    suspend fun close() {
        connected = false
        withContext(NonCancellable) { withTimeoutOrNull(2000) { client.close() } }
        if (this::process.isInitialized) {
            process.destroy()
            if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
        }
    }
}
