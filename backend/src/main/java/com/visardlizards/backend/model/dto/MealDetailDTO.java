package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import org.jspecify.annotations.Nullable;

/** A single meal with where/when it is served and its user ratings. */
public record MealDetailDTO(
		String mensaId,
		LocalDate date,
		MealDTO meal,
		@Nullable BigDecimal avgRating,
		/** e.g. {"tasty": 3, "worth-it": 1} */
		Map<String, Integer> tagCounts) {
}
