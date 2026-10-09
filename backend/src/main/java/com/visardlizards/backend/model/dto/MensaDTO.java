package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;

import org.jspecify.annotations.Nullable;

/** id: use it for /api/mensas/{id} (not on the whiteboard, added for that). */
public record MensaDTO(
		String id,
		String title,
		@Nullable OpeningHoursDTO openingHours,
		String campus,
		String location,
		@Nullable BigDecimal avgRating,
		@Nullable MealPlanDTO mealPlan) {
}
