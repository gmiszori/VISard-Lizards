package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.StructuredMealQuery;
import com.visardlizards.backend.model.dto.StructuredMealResultDTO;
import com.visardlizards.backend.model.dto.StructuredMealSearchRequest;
import com.visardlizards.backend.model.dto.StructuredMealSearchResponse;

@SpringBootTest
@AutoConfigureMockMvc
class StructuredMealSearchTests {

	@Autowired
	private OpenAiQueryParserService parserService;

	@Autowired
	private StructuredMealSearchService searchService;

	@Autowired
	private MockMvc mockMvc;

	@Test
	void parsesFishQueryWithHardConstraintsAndPriorities() {
		String query = "i want to eat fish for a low price in a close place for at most 15chf";
		StructuredMealQuery parsed = parserService.parseHeuristically(query);

		assertThat(parsed.diet()).isEqualTo("fish");
		assertThat(parsed.maxPrice()).isEqualTo(15.0);
		assertThat(parsed.prioritizePrice()).isTrue();
		assertThat(parsed.prioritizeDistance()).isTrue();
		assertThat(parsed.searchTerms()).contains("fish", "salmon", "lachs", "trout", "forelle", "tuna", "cod");
	}

	@Test
	void parsesVeganBudgetAtZentrum() {
		String query = "vegan curry under 12 chf at zentrum";
		StructuredMealQuery parsed = parserService.parseHeuristically(query);

		assertThat(parsed.diet()).isEqualTo("vegan");
		assertThat(parsed.maxPrice()).isEqualTo(12.0);
		assertThat(parsed.campus()).isEqualTo("zentrum");
		assertThat(parsed.searchTerms()).contains("curry");
	}

	@Test
	void searchFiltersByHardPriceAndDietConstraints() {
		// Mensa Polyterrasse coordinates approximately 47.3764, 8.5477
		StructuredMealSearchRequest request = new StructuredMealSearchRequest(
				"i want to eat fish for a low price in a close place for at most 15chf",
				47.3764,
				8.5477,
				LocalDate.of(2026, 9, 29),
				null,
				PriceCategory.STUDENT,
				null);

		StructuredMealSearchResponse response = searchService.search(request);

		assertThat(response.structuredQuery()).isNotNull();
		assertThat(response.structuredQuery().diet()).isEqualTo("fish");
		assertThat(response.structuredQuery().maxPrice()).isEqualTo(15.0);

		for (StructuredMealResultDTO result : response.results()) {
			// Every matched meal must respect the hard maxPrice <= 15 CHF
			assertThat(result.price()).isNotNull();
			assertThat(result.price()).isLessThanOrEqualTo(15.0);

			// Distance must be calculated since user coordinates were provided
			assertThat(result.distanceM()).isNotNull();
		}
	}

	@Test
	void endpointExtractQueryReturnsStructuredJson() throws Exception {
		mockMvc.perform(post("/api/search/extract-query")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"query\": \"i want to eat fish for a low price in a close place for at most 15chf\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.diet").value("fish"))
				.andExpect(jsonPath("$.maxPrice").value(15.0))
				.andExpect(jsonPath("$.prioritizePrice").value(true))
				.andExpect(jsonPath("$.prioritizeDistance").value(true))
				.andExpect(jsonPath("$.searchTerms").isArray());
	}

	@Test
	void endpointSearchStructuredReturnsRankedResults() throws Exception {
		mockMvc.perform(post("/api/meals/search-structured")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "query": "i want to eat fish for a low price in a close place for at most 15chf",
								  "userLat": 47.3764,
								  "userLng": 8.5477,
								  "date": "2026-09-29",
								  "priceCategory": "STUDENT"
								}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.structuredQuery.diet").value("fish"))
				.andExpect(jsonPath("$.structuredQuery.maxPrice").value(15.0))
				.andExpect(jsonPath("$.results").isArray());
	}
}
