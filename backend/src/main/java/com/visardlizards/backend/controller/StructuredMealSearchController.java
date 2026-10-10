package com.visardlizards.backend.controller;

import java.time.LocalDate;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.StructuredMealQuery;
import com.visardlizards.backend.model.dto.StructuredMealSearchRequest;
import com.visardlizards.backend.model.dto.StructuredMealSearchResponse;
import com.visardlizards.backend.service.OpenAiQueryParserService;
import com.visardlizards.backend.service.StructuredMealSearchService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Tag(name = "Structured AI Meal Search", description = "Extract structured database queries with OpenAI and search meals with price and distance ranking")
public class StructuredMealSearchController {

	private final StructuredMealSearchService searchService;
	private final OpenAiQueryParserService parserService;

	public StructuredMealSearchController(
			StructuredMealSearchService searchService,
			OpenAiQueryParserService parserService) {
		this.searchService = searchService;
		this.parserService = parserService;
	}

	@PostMapping("/api/meals/search-structured")
	@Operation(summary = "Execute structured natural language search", description = """
			Extracts structured constraints (max price, diet, fish varieties, allergens) from natural language
			via OpenAI, queries the database with hard constraints, and sorts results prioritizing lower price and closer distance.
			""")
	public StructuredMealSearchResponse searchStructured(@RequestBody StructuredMealSearchRequest request) {
		return searchService.search(request);
	}

	@GetMapping("/api/meals/search-structured")
	@Operation(summary = "Execute structured natural language search via GET", description = "Query meals with natural language query, coordinates, and optional filters.")
	public StructuredMealSearchResponse searchStructuredGet(
			@RequestParam String query,
			@RequestParam(required = false) @Nullable Double userLat,
			@RequestParam(required = false) @Nullable Double userLng,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate date,
			@RequestParam(required = false) @Nullable String campus,
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		StructuredMealSearchRequest request = new StructuredMealSearchRequest(
				query, userLat, userLng, date, campus, priceCategory, null);
		return searchService.search(request);
	}

	@PostMapping("/api/search/extract-query")
	@Operation(summary = "Extract structured meal query with OpenAI", description = "Returns the structured database query representation extracted by OpenAI from natural language.")
	public StructuredMealQuery extractQuery(@RequestBody Map<String, String> body) {
		String query = body != null ? body.get("query") : "";
		return parserService.parse(query == null ? "" : query);
	}
}
