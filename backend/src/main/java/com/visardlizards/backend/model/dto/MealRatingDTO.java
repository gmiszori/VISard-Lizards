package com.visardlizards.backend.model.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

/** A saved meal rating. ratedAt is set by the server; source is null if the request did not give one. */
public record MealRatingDTO(String mealId, String mensaId, LocalDate mealDate, String userId, int stars,
		List<String> tags, Instant ratedAt, @Nullable String source) {
}
