package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

public record MealRatingRequestDTO(
		@Schema(description = "Stars from 1 to 5", minimum = "1", maximum = "5", example = "5") int stars,
		@Schema(description = "Optional: tasty, big-portion, small-portion, cold, too-salty, worth-it",
				example = "[\"tasty\", \"worth-it\"]") @Nullable List<String> tags) {
}
