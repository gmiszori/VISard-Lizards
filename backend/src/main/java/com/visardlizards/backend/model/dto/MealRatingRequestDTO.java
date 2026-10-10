package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record MealRatingRequestDTO(
		@Schema(description = "Stars from 1 to 5", minimum = "1", maximum = "5", example = "5") @Min(1) @Max(5) int stars,
		@Schema(description = "Optional: tasty, big-portion, small-portion, cold, too-salty, worth-it",
				example = "[\"tasty\", \"worth-it\"]") @Size(max = 6) @Nullable List<String> tags) {
}
