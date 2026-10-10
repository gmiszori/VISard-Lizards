package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * Structured query extracted from a user's natural language meal request (via OpenAI or fallback).
 * Contains hard database constraints (budget, diet, allergens), food search terms (synonyms / varieties),
 * and ranking criteria (price priority, distance priority, etc.).
 */
public record StructuredMealQuery(
		String originalQuery,
		@Nullable Double maxPrice,
		@Nullable Double minPrice,
		@Nullable String diet,
		List<String> searchTerms,
		List<String> excludeAllergens,
		@Nullable String campus,
		boolean prioritizePrice,
		boolean prioritizeDistance,
		boolean prioritizeRating,
		boolean prioritizeEco,
		@Nullable String explanation) {

	public StructuredMealQuery {
		if (searchTerms == null) {
			searchTerms = List.of();
		}
		if (excludeAllergens == null) {
			excludeAllergens = List.of();
		}
	}
}
