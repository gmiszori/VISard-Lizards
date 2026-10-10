package mensa.connector

import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import java.nio.file.Path
import java.util.concurrent.CountDownLatch

fun main(args: Array<String>) = runBlocking {
    val jar = args.firstOrNull() ?: System.getenv("MEAL_MCP_JAR") ?: "build/tasks/_server_executableJarJvm/server-jvm-executable.jar"
    val host = System.getenv("MEAL_CONNECTOR_HOST") ?: "127.0.0.1"
    val port = (System.getenv("MEAL_CONNECTOR_PORT") ?: "8091").toInt()
    require(port in 1..65535) { "Invalid connector port." }
    val connection = McpConnection(Path.of(jar))
    connection.start()
    val stopped = CountDownLatch(1)
    val origins = System.getenv("MEAL_CONNECTOR_ALLOWED_ORIGINS").orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    val relayToken = System.getenv("MEAL_CONNECTOR_TOKEN")?.takeIf { it.isNotBlank() }
    val http = try { HttpConnector(InetSocketAddress(host, port), connection, relayToken, origins) }
    catch (ex: Exception) { connection.close(); throw ex }
    Runtime.getRuntime().addShutdownHook(Thread {
        http.close(); runBlocking { connection.close() }; stopped.countDown()
    })
    http.start()
    System.err.println("Mensa HTTP connector listening on http://$host:$port (dedicated MCP connected)")
    stopped.await()
}
