package mensa

import okhttp3.*
import java.net.InetAddress
import java.net.Inet4Address
import java.net.Proxy
import java.net.URI
import java.util.concurrent.TimeUnit

class PublicWebFetcher : AutoCloseable {
    private val client = OkHttpClient.Builder()
        .proxy(Proxy.NO_PROXY).followRedirects(false).followSslRedirects(false)
        .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> = InetAddress.getAllByName(hostname).toList().also { addresses ->
                require(addresses.isNotEmpty() && addresses.all(::isPublicAddress)) { "Host must resolve only to public addresses." }
            }.sortedBy { if (it is Inet4Address) 0 else 1 }
        }).connectTimeout(6, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS).build()
    private data class Cached<T>(val value: T, val expiresAt: Long)
    private val documents = linkedMapOf<String, Cached<SourceDocument>>()
    private val robots = linkedMapOf<String, Cached<RobotsRules>>()

    @Synchronized fun fetch(url: String): SourceDocument {
        var current = validateUrl(url)
        cached(documents, current)?.let { return it }
        repeat(5) { redirects ->
            val uri = URI(current)
            val origin = "https://${uri.rawAuthority}"
            val rules = cached(robots, origin) ?: loadRobots(origin).also { put(robots, origin, it) }
            require(rules.allows(uri.rawPath.ifEmpty { "/" } + (uri.rawQuery?.let { "?$it" } ?: ""))) { "Scraping is disallowed by robots.txt." }
            val response = download(current)
            if (response.code in listOf(301, 302, 303, 307, 308)) {
                require(redirects < 4) { "Too many redirects." }
                current = validateUrl(uri.resolve(response.location ?: error("Redirect without Location.")).toString())
            } else {
                check(response.code in 200..299) { "Source returned HTTP ${response.code}." }
                require(response.mediaType in setOf("text/html", "application/xhtml+xml", "application/pdf", "text/plain", "application/json")) { "Unsupported source type: ${response.mediaType}." }
                val document = SourceDocument(current, response.mediaType, response.bytes)
                put(documents, validateUrl(url), document)
                return document
            }
        }
        error("Too many redirects.")
    }

    private fun loadRobots(origin: String): RobotsRules {
        // A redirect to another origin is not followed: avoiding recursive robots fetches.
        val result = download("$origin/robots.txt", 512 * 1024)
        if (result.code in 400..499 && result.code != 429) return RobotsRules("")
        check(result.code in 200..299) { "robots.txt unavailable (HTTP ${result.code}); refusing to scrape." }
        return RobotsRules(result.bytes.decodeToString())
    }
    private data class Download(val code: Int, val mediaType: String, val bytes: ByteArray, val location: String?)
    private fun download(url: String, maxBytes: Int = 8 * 1024 * 1024): Download {
        validateUrl(url)
        val request = Request.Builder().url(url).header("User-Agent", "MealScraperMcp/1.0 (+https://github.com/NikitaSosnovski/hackathon-mensamcp)")
            .header("Accept", "text/html,application/pdf,application/json,text/plain").build()
        client.newCall(request).execute().use { response ->
            val body = response.body ?: error("Empty response body.")
            require(body.contentLength() <= maxBytes) { "Source exceeds download limit." }
            val bytes = body.byteStream().readNBytes(maxBytes + 1)
            require(bytes.size <= maxBytes) { "Source exceeds download limit." }
            return Download(response.code, body.contentType()?.let { "${it.type}/${it.subtype}" }.orEmpty(), bytes, response.header("Location"))
        }
    }
    private fun <T> cached(cache: MutableMap<String, Cached<T>>, key: String): T? = cache[key]?.let {
        if (it.expiresAt > System.currentTimeMillis()) it.value else { cache.remove(key); null }
    }
    private fun <T> put(cache: MutableMap<String, Cached<T>>, key: String, value: T) {
        if (cache.size >= 16) cache.remove(cache.keys.first())
        cache[key] = Cached(value, System.currentTimeMillis() + 600_000)
    }
    override fun close() { client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll() }

    companion object {
        fun validateUrl(url: String): String {
            require(url.length <= 4096) { "URL is too long." }
            val uri = runCatching { URI(url) }.getOrElse { throw IllegalArgumentException("Invalid URL.") }
            require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.rawUserInfo == null && uri.port in listOf(-1, 443)) {
                "A public HTTPS URL on port 443 without credentials is required."
            }
            val host = uri.host.removePrefix("[").removeSuffix("]")
            require(host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local")) { "Local hosts are not allowed." }
            if (host.contains(':') || host.matches(Regex("[0-9.]+"))) require(isPublicAddress(InetAddress.getByName(host))) { "Private addresses are not allowed." }
            return uri.toString().substringBefore('#')
        }
        fun isPublicAddress(address: InetAddress): Boolean {
            if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress || address.isMulticastAddress) return false
            val b = address.address.map { it.toInt() and 255 }
            if (b.size == 16) return b[0] in 0x20..0x3f && !(b[0] == 0x20 && b[1] == 1 && b[2] == 0x0d && b[3] == 0xb8)
            return b[0] !in setOf(0, 10, 127) && b[0] < 224 &&
                !(b[0] == 100 && b[1] in 64..127) && !(b[0] == 169 && b[1] == 254) &&
                !(b[0] == 172 && b[1] in 16..31) && !(b[0] == 192 && b[1] == 168) &&
                !(b[0] == 192 && b[1] == 0) && !(b[0] == 192 && b[1] == 2) &&
                !(b[0] == 198 && b[1] in 18..19) && !(b[0] == 198 && b[1] == 51 && b[2] == 100) &&
                !(b[0] == 203 && b[1] == 0 && b[2] == 113)
        }
    }
}

class RobotsRules(text: String) {
    private data class Group(val agents: MutableList<String> = mutableListOf(), val rules: MutableList<Pair<String, Boolean>> = mutableListOf())
    private val rules: List<Pair<String, Boolean>>
    init {
        val groups = mutableListOf<Group>()
        var group = Group(); var rulesStarted = false
        text.lineSequence().forEach { line ->
            val entry = line.substringBefore('#').split(':', limit = 2)
            if (entry.size != 2) return@forEach
            val key = entry[0].trim().lowercase(); val value = entry[1].trim()
            if (key == "user-agent") {
                if (rulesStarted) { groups += group; group = Group(); rulesStarted = false }
                group.agents += value.lowercase()
            } else if (key == "allow" || key == "disallow") {
                rulesStarted = true
                if (value.isNotEmpty()) group.rules += value to (key == "allow")
            }
        }
        groups += group
        val specific = groups.filter { it.agents.any { agent -> agent != "*" && "mealscrapermcp".contains(agent) } }
        rules = (specific.ifEmpty { groups.filter { "*" in it.agents } }).flatMap { it.rules }
    }
    fun allows(path: String): Boolean {
        val matching = rules.filter { (pattern, _) ->
            val end = pattern.endsWith('$')
            val body = if (end) pattern.dropLast(1) else pattern
            val regex = "^" + body.split('*').joinToString(".*") { Regex.escape(it) } + if (end) "$" else ""
            Regex(regex).containsMatchIn(path)
        }
        return matching.maxWithOrNull(compareBy<Pair<String, Boolean>> { it.first.count { c -> c != '*' && c != '$' } }.thenBy { it.second })?.second ?: true
    }
}
