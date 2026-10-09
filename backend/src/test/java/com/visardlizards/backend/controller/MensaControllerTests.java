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
class MensaControllerTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void listsAllMensas() throws Exception {
		mockMvc.perform(get("/api/mensas"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(22))
				.andExpect(jsonPath("$[0].title").value("Archimedes"))
				.andExpect(jsonPath("$[0].location").value("Gloriastrasse 37/39, 8092 Zürich"))
				.andExpect(jsonPath("$[0].mealPlan").doesNotExist());
	}

	@Test
	void filtersMensasByCampus() throws Exception {
		mockMvc.perform(get("/api/mensas").param("campus", "irchel"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(4));
	}

	@Test
	void returnsMealPlanKeyedByDate() throws Exception {
		mockMvc.perform(get("/api/mensas/archimedes/meal-plan")
						.param("dateStart", "2026-10-05")
						.param("dateEnd", "2026-10-06"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$['2026-10-05'][0].timeStart").value("11:00"))
				.andExpect(jsonPath("$['2026-10-05'][0].timeEnd").value("14:00"))
				.andExpect(jsonPath("$['2026-10-05'][0].meal.name").isString())
				.andExpect(jsonPath("$['2026-10-05'][0].meal.price.cat").value("student"))
				.andExpect(jsonPath("$['2026-10-06']").isArray())
				.andExpect(jsonPath("$['2026-10-07']").doesNotExist());
	}

	@Test
	void rejectsInvertedDateRange() throws Exception {
		mockMvc.perform(get("/api/mensas/archimedes/meal-plan")
						.param("dateStart", "2026-10-06")
						.param("dateEnd", "2026-10-05"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void returns404ForUnknownMensa() throws Exception {
		mockMvc.perform(get("/api/mensas/does-not-exist"))
				.andExpect(status().isNotFound());
	}

	@Test
	void ratingUpdatesAverage() throws Exception {
		mockMvc.perform(post("/api/mensas/polyterrasse/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 4}"))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/mensas/polyterrasse/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 5}"))
				.andExpect(status().isCreated());
		mockMvc.perform(get("/api/mensas/polyterrasse"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.avgRating").value(4.5));
	}

	@Test
	void rejectsInvalidRating() throws Exception {
		mockMvc.perform(post("/api/mensas/polyterrasse/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 9}"))
				.andExpect(status().isBadRequest());
	}

}
