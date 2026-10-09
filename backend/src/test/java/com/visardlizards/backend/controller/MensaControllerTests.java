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
				.andExpect(jsonPath("$[0].id").value("archimedes"))
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
	void ordersLunchBeforeDinner() throws Exception {
		mockMvc.perform(get("/api/mensas/polyterrasse/meal-plan")
						.param("dateStart", "2026-10-06")
						.param("dateEnd", "2026-10-06")
						.param("priceCategory", "STAFF"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$['2026-10-06'][0].meal.classification[2]").value("lunch"))
				.andExpect(jsonPath("$['2026-10-06'][-1].meal.classification[2]").value("dinner"))
				.andExpect(jsonPath("$['2026-10-06'][0].meal.price.cat").value("staff"));
	}

	@Test
	void rejectsInvertedDateRange() throws Exception {
		mockMvc.perform(get("/api/mensas/archimedes/meal-plan")
						.param("dateStart", "2026-10-06")
						.param("dateEnd", "2026-10-05"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("dateEnd must not be before dateStart"));
	}

	@Test
	void rejectsInvertedDateRangeOnMensaDetail() throws Exception {
		mockMvc.perform(get("/api/mensas/archimedes")
						.param("dateStart", "2026-10-06")
						.param("dateEnd", "2026-10-05"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void temporarilyClosedMensaHasNoOpeningHours() throws Exception {
		mockMvc.perform(get("/api/mensas/uzh-lichthof"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.openingHours.*[*]").isEmpty());
	}

	@Test
	void metaDescribesTheDataRange() throws Exception {
		mockMvc.perform(get("/api/meta"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.today").isString())
				.andExpect(jsonPath("$.menuDate").isString())
				.andExpect(jsonPath("$.dataFrom").value("2026-09-28"))
				.andExpect(jsonPath("$.dataTo").value("2026-10-09"));
	}

	@Test
	void returns404ForUnknownMensa() throws Exception {
		mockMvc.perform(get("/api/mensas/does-not-exist"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Mensa not found: does-not-exist"));
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
	void crowdReportShowsUpAsLive() throws Exception {
		mockMvc.perform(post("/api/mensas/archimedes/crowd-reports")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"level\": 4}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.mensaId").value("archimedes"))
				.andExpect(jsonPath("$.timestamp").isString());
		mockMvc.perform(get("/api/mensas/archimedes/crowd"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.live[0].level").value(4))
				.andExpect(jsonPath("$.histogram.sufficient").value(false))
				.andExpect(jsonPath("$.histogram.byWeekday").doesNotExist());
	}

	@Test
	void crowdOfUnknownMensaIs404() throws Exception {
		mockMvc.perform(get("/api/mensas/does-not-exist/crowd"))
				.andExpect(status().isNotFound());
	}

	@Test
	void rejectsInvalidRating() throws Exception {
		mockMvc.perform(post("/api/mensas/polyterrasse/ratings")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"stars\": 9}"))
				.andExpect(status().isBadRequest());
	}

}
