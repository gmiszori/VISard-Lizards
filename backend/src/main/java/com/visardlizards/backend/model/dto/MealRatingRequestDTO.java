package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record MealRatingRequestDTO(
		@Schema(description = "Anonymous user id the frontend keeps per device: \"anon:\" + UUID",
				example = "anon:3f1c2b7e-9a4d-4e8b-8c1f-2d5e6a7b8c9d")
		@NotNull @Pattern(regexp = "anon:[0-9a-fA-F-]{36}", message = "must be \"anon:\" followed by a UUID") String userId,
		@Schema(description = "Stars from 1 to 5", minimum = "1", maximum = "5", example = "5") @Min(1) @Max(5) int stars,
		@Schema(description = "Optional: tasty, big-portion, small-portion, cold, too-salty, worth-it",
				example = "[\"tasty\", \"worth-it\"]") @Size(max = 6) @Nullable List<String> tags,
		@Schema(description = "Optional: how the app knows the user ate there. location (located at the mensa), "
				+ "crowd (reported its crowd) or guess (picked it when asked). crowd and guess count half in averages.",
				example = "location", allowableValues = { "location", "crowd", "guess" })
		@Pattern(regexp = "location|crowd|guess", message = "must be location, crowd or guess") @Nullable String source) {

	/** A rating without a source. */
	public MealRatingRequestDTO(String userId, int stars, @Nullable List<String> tags) {
		this(userId, stars, tags, null);
	}
}
