package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * Result of a structured meal search with the extracted structured query, matches, and metadata.
 */
public record StructuredMealSearchResponse(
		StructuredMealQuery structuredQuery,
		int totalMatches,
		List<StructuredMealResultDTO> results,
		@Nullable Double userLat,
		@Nullable Double userLng) {
}
