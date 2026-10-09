package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

/** tags: tasty, big-portion, small-portion, cold, too-salty, worth-it (optional). */
public record MealRatingRequestDTO(int stars, @Nullable List<String> tags) {
}
