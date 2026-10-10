package com.visardlizards.backend.model.dto;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

public record HybridMealSearchResponse(SearchCriteria criteria, int totalMatches, List<Result> results) {
    public record Result(String mensaId, String mensaName, LocalDate date, MealDTO meal,
            @Nullable Double similarity, @Nullable Double distanceM) {
    }
}
