package mensa.route
import java.time.Instant
import kotlinx.serialization.json.*
import kotlin.test.*
class OpenStreetMapsTest {
    @Test fun rejectsPastOrInventedProviderGeometry() {
        val value = json.parseToJsonElement("""{"departure":"2026-10-12T09:00:00Z","arrival":"2026-10-12T09:15:00Z","distanceMetres":1000,"directions":["Walk"],"provider":{"mode":"WALK","polyline":"_p~iF~ps|U_ulLnnqC_mqNvxq`@"}}""").jsonObject
        assertEquals(Instant.parse("2026-10-12T09:15:00Z"), parseOpenLeg(value, Instant.parse("2026-10-12T09:00:00Z")).arrival)
        assertFailsWith<IllegalArgumentException> { parseOpenLeg(value, Instant.parse("2026-10-12T09:01:00Z")) }
        val missing = buildJsonObject { value.forEach { (key, element) -> put(key, element) }; put("provider", buildJsonObject {put("mode","WALK");put("polyline","")}) }
        assertFailsWith<IllegalArgumentException> { parseOpenLeg(missing, Instant.parse("2026-10-12T09:00:00Z")) }
    }
    @Test fun corridorIncludesMiddleOfSparseSegments() {
        assertTrue(corridorDistance(Point(47.37,8.55), listOf(Point(47.37,8.5), Point(47.37,8.6))) < 1)
        assertEquals(Point(38.5,-120.2), decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@").first())
    }
}
