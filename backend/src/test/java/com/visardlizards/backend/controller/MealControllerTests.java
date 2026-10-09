package com.visardlizards.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class MealControllerTests {

	private static final String MEAL_ID = "alumni-quattro-lounge.2026-09-28.dinner.0";

	@Autowired
	private MockMvc mockMvc;

	@Test
	void returnsMealDetail() throws Exception {
		mockMvc.perform(get("/api/meals/" + MEAL_ID).param("priceCategory", "EXTERNAL"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mensaId").value("alumni-quattro-lounge"))
				.andExpect(jsonPath("$.date").value("2026-09-28"))
				.andExpect(jsonPath("$.meal.id").value(MEAL_ID))
				.andExpect(jsonPath("$.meal.name").value("Ground Meat with Horn-Shaped Noodles"))
				.andExpect(jsonPath("$.meal.price.price").value(14.5))
				.andExpect(jsonPath("$.meal.price.cat").value("external"));
	}

	@Test
	void mealPlanEntriesCarryTheMealId() throws Exception {
		mockMvc.perform(get("/api/mensas/alumni-quattro-lounge/meal-plan")
						.param("dateStart", "2026-09-28")
						.param("dateEnd", "2026-09-28"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$['2026-09-28'][*].meal.id").isNotEmpty());
	}

	@Test
	void ratingUpdatesAverageAndTagCounts() throws Exception {
		String mealId = "polyterrasse.2026-10-06.lunch.0";
		mockMvc.perform(post("/api/meals/" + mealId + "/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 5, \"tags\": [\"tasty\", \"worth-it\"]}"))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/meals/" + mealId + "/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 2}"))
				.andExpect(status().isCreated());
		mockMvc.perform(get("/api/meals/" + mealId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.avgRating").value(3.5))
				.andExpect(jsonPath("$.tagCounts.tasty").value(1))
				.andExpect(jsonPath("$.tagCounts['worth-it']").value(1));
	}

	@Test
	void rejectsUnknownTag() throws Exception {
		mockMvc.perform(post("/api/meals/" + MEAL_ID + "/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 4, \"tags\": [\"yummy\"]}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void rejectsNullTag() throws Exception {
		mockMvc.perform(post("/api/meals/" + MEAL_ID + "/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 4, \"tags\": [null]}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void returns404ForUnknownMeal() throws Exception {
		mockMvc.perform(get("/api/meals/does-not-exist"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Meal not found: does-not-exist"));
	}

}
