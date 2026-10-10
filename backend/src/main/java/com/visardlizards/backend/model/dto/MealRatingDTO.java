package com.visardlizards.backend.model.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** A saved meal rating. ratedAt is set by the server. */
public record MealRatingDTO(String mealId, String mensaId, LocalDate mealDate, String userId, int stars,
		List<String> tags, Instant ratedAt) {
}
