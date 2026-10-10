package mensa.route

import java.time.Duration
import java.time.Instant
import kotlin.test.*

class MealRoutePlannerTest {
    private val start = Instant.parse("2026-10-12T09:00:00Z")
    private fun at(minutes: Long) = start.plus(Duration.ofMinutes(minutes))
    private val routes = RouteProvider { _, _, departure -> RouteLeg(departure, departure.plusSeconds(600), 500, listOf("Walk")) }
    private fun stop(open: Long, close: Long) = MealStop("test", "Test", "47.3,8.5", listOf(MealWindow(at(open), at(close))))

    @Test fun waitsForOpeningAndPreservesFullMealBreak() {
        val result = MealRoutePlanner(routes).evaluate("home", "university", start, at(120), 60, listOf(stop(30, 100))).single()
        assertEquals(at(30), result.mealStart)
        assertEquals(at(90), result.mealEnd)
        assertEquals(at(100), result.onward.arrival)
        assertEquals(20L, result.spareMinutes)
    }
    @Test fun rejectsInsufficientMealWindowAndMissingTimetables() {
        assertTrue(MealRoutePlanner(routes).evaluate("a", "b", start, at(120), 45, listOf(stop(0, 54))).isEmpty())
        assertTrue(MealRoutePlanner(RouteProvider { _, _, _ -> null }).evaluate("a", "b", start, at(120), 45, listOf(stop(0, 120))).isEmpty())
    }
    @Test fun requiresFiveMinuteArrivalBufferAndAvoidsDuplicateStops() {
        val planner = MealRoutePlanner(routes)
        assertTrue(planner.evaluate("a", "b", start, at(69), 45, listOf(stop(0, 120))).isEmpty())
        assertEquals(1, planner.evaluate("a", "b", start, at(70), 45, listOf(stop(0, 120), stop(0, 120))).size)
    }
    @Test fun triesLaterServiceWindowWhenFirstIsTooShort() {
        val candidate = stop(0, 30).copy(windows = listOf(MealWindow(at(0), at(30)), MealWindow(at(40), at(120))))
        assertEquals(at(40), MealRoutePlanner(routes).evaluate("a", "b", start, at(130), 45, listOf(candidate)).single().mealStart)
    }
}
