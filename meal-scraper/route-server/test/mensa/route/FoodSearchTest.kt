package mensa.route

import kotlinx.serialization.json.*
import kotlin.test.*

class FoodSearchTest {
    private val place=buildJsonObject { put("name","Test kebab");put("cuisine","kebab");put("sourceUrl","https://www.openstreetmap.org/node/1") }
    @Test fun foodEvidenceCanOutweighAModestDetour() {
        assertTrue(mealScore(700.0,place)<mealScore(0.0,buildJsonObject {}))
        assertTrue(mealScore(2000.0,place)>mealScore(0.0,buildJsonObject {}))
        assertEquals(mealScore(0.0,buildJsonObject {}),mealScore(0.0,buildJsonObject { put("cuisine","coffee_shop") }))
    }
    @Test fun missingCredentialsUseLabelledTagsAndSources() {
        val result=FoodSearch.search(buildJsonObject { put("place",place) })
        assertEquals("fallback",result.text("status"));assertTrue(result.text("description").contains("not verified"))
        assertEquals(1,result.array("sources").size)
    }
    @Test fun uncitedOrUnsafeResearchCannotBecomeVerifiedFood() {
        val response=buildJsonObject {
            put("status","completed");put("output",buildJsonArray { add(buildJsonObject { put("content",buildJsonArray {
                add(buildJsonObject { put("type","output_text");put("text","Pizza");put("annotations",buildJsonArray {
                    add(buildJsonObject { put("type","url_citation");put("url","javascript:alert(1)") })
                }) })
            }) }) })
        }
        assertEquals("fallback",FoodSearch.evidence(response,place).text("status"))
    }
    @Test fun completedCitedResearchPreservesEvidence() {
        val response=Json.parseToJsonElement("""{"status":"completed","output":[{"content":[{"type":"output_text","text":"Japanese food","annotations":[{"type":"url_citation","url":"https://example.com/food","title":"Official venue"}]}]}]}""").jsonObject
        val result=FoodSearch.evidence(response,place)
        assertEquals("researched",result.text("status"));assertEquals("Japanese food",result.text("description"))
        assertEquals("https://example.com/food",result.array("sources").first().jsonObject.text("url"))
    }
}
