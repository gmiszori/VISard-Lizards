package com.visardlizards.backend.model.dto;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

import com.visardlizards.backend.model.domain.PriceCategory;

public record HybridMealSearchRequest(@Nullable String query, @Nullable String mensaId,
        @Nullable String campusId, @Nullable LocalDate date, @Nullable PriceCategory priceCategory,
        @Nullable Double userLat, @Nullable Double userLng, @Nullable Integer limit,
        @Nullable List<String> campusIds) {

    /** Keeps source compatibility for callers that provide one campus or no campus scope. */
    public HybridMealSearchRequest(String query, String mensaId, String campusId, LocalDate date,
            PriceCategory priceCategory, Double userLat, Double userLng, Integer limit) {
        this(query, mensaId, campusId, date, priceCategory, userLat, userLng, limit, null);
    }
}
