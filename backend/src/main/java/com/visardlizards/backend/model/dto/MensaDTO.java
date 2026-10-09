package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;

import org.jspecify.annotations.Nullable;

public record MensaDTO(
		String title,
		@Nullable OpeningHoursDTO openingHours,
		String campus,
		String location,
		@Nullable BigDecimal avgRating,
		@Nullable MealPlanDTO mealPlan) {
}
