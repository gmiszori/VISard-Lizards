package com.visardlizards.backend.model.dto;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

import com.visardlizards.backend.model.domain.PriceCategory;

/** {@code today} is the app's (possibly simulated) Zurich date that relative words like "today" resolve against. */
public record HybridMealSearchRequest(@Nullable String query, @Nullable String mensaId,
        @Nullable String campusId, @Nullable LocalDate date, @Nullable PriceCategory priceCategory,
        @Nullable Double userLat, @Nullable Double userLng, @Nullable Integer limit,
        @Nullable List<String> campusIds, @Nullable SearchCriteria criteria, @Nullable String appLanguage,
        @Nullable LocalDate today) {

    public HybridMealSearchRequest(String query, String mensaId, String campusId, LocalDate date,
            PriceCategory priceCategory, Double userLat, Double userLng, Integer limit, List<String> campusIds) {
        this(query, mensaId, campusId, date, priceCategory, userLat, userLng, limit, campusIds, null, null, null);
    }

    public HybridMealSearchRequest(String query, String mensaId, String campusId, LocalDate date,
            PriceCategory priceCategory, Double userLat, Double userLng, Integer limit,
            List<String> campusIds, SearchCriteria criteria) {
        this(query, mensaId, campusId, date, priceCategory, userLat, userLng, limit, campusIds, criteria, null, null);
    }

    /** Keeps source compatibility for callers that provide one campus or no campus scope. */
    public HybridMealSearchRequest(String query, String mensaId, String campusId, LocalDate date,
            PriceCategory priceCategory, Double userLat, Double userLng, Integer limit) {
        this(query, mensaId, campusId, date, priceCategory, userLat, userLng, limit, null, null, null, null);
    }
}
