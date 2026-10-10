package mensa.route

import java.time.*
import kotlinx.serialization.json.*
import kotlin.test.*

class GoogleMapsTest {
    @Test fun classifiesDailyQuotaWithoutLeakingProviderPayload() {
        val payload = """{"error":{"message":"secret-provider-payload","details":[{"metadata":{"quota_limit":"ComputeRoutesRequestsPerDay","quota_limit_value":"100"}}]}}"""
        val daily = googleFailure(429, payload, true)
        assertEquals("google_routes_daily_quota", daily.code)
        assertFalse(daily.message!!.contains("secret-provider-payload"))
        assertEquals("google_quota", googleFailure(429, payload, false).code)
        assertEquals("google_quota", googleFailure(429, "not JSON", true).code)
        assertEquals("google_request_failed", googleFailure(403, payload, true).code)
    }
    private fun parse(value: String) = json.parseToJsonElement(value).jsonObject
    @Test fun accountsForWaitingBetweenWalkingAndScheduledTransit() {
        val route = parse("""{"distanceMeters":5000,"polyline":{"encodedPolyline":"abc"},"legs":[{"steps":[
          {"staticDuration":"600s","navigationInstruction":{"instructions":"Walk to stop"}},
          {"transitDetails":{"stopDetails":{"departureTime":"2026-10-12T09:30:00Z","arrivalTime":"2026-10-12T09:50:00Z","departureStop":{"name":"A"},"arrivalStop":{"name":"B"}},"transitLine":{"nameShort":"7"}}},
          {"staticDuration":"300s"}]}]}""")
        val leg = scheduledLeg(route, Instant.parse("2026-10-12T09:00:00Z"), "TRANSIT")!!
        assertEquals(Instant.parse("2026-10-12T09:55:00Z"), leg.arrival)
        assertTrue(leg.directions.any { it.contains("7 from A to B") })
        assertNull(scheduledLeg(route, Instant.parse("2026-10-12T09:25:00Z"), "TRANSIT"))
    }
    @Test fun absentCurrentPeriodsDoNotInventOpeningFromRegularHours() {
        val place = parse("""{"currentOpeningHours":{"periods":[]},"regularOpeningHours":{"periods":[{"open":{"day":1,"hour":0}}]}}""")
        assertTrue(placeWindows(place, LocalDate.parse("2026-10-12")).isEmpty())
    }
    @Test fun parsesDatedClosuresAndOvernightHours() {
        val place = parse("""{"currentOpeningHours":{"periods":[{"open":{"date":{"year":2026,"month":10,"day":11},"hour":22},"close":{"date":{"year":2026,"month":10,"day":12},"hour":2}}]}}""")
        val window = placeWindows(place, LocalDate.parse("2026-10-12")).single()
        assertEquals(Instant.parse("2026-10-11T22:00:00Z"), window.open)
        assertEquals(Instant.parse("2026-10-12T00:00:00Z"), window.close)
        assertTrue(placeWindows(place, LocalDate.parse("2026-10-13")).isEmpty())
    }
    @Test fun corridorIncludesMiddleOfSparseSegmentsAndPolylineDecodes() {
        assertTrue(corridorDistance(Point(47.37,8.55), listOf(Point(47.37,8.5), Point(47.37,8.6))) < 1)
        assertEquals(Point(38.5,-120.2), decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@").first())
    }
}
