package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import org.jspecify.annotations.Nullable;

/**
 * A meal matching a structured query, ranked according to user preferences (price, distance, relevance).
 */
public record StructuredMealResultDTO(
		String mensaId,
		String mensaName,
		String campus,
		@Nullable Double distanceM,
		LocalDate date,
		MealDTO meal,
		@Nullable BigDecimal avgRating,
		Map<String, Integer> tagCounts,
		double score,
		@Nullable Double price,
		@Nullable String matchReason) {
}
