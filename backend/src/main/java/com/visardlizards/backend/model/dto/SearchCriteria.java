package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;
import java.util.List;
import java.time.LocalDate;

import org.jspecify.annotations.Nullable;

/** Only fields present in MealEntity are eligible for hard filtering. */
public record SearchCriteria(@Nullable String semanticQuery, boolean isLocationScoped,
        HardFilters hardFilters, SortBy sortBy) {
    public SearchCriteria {
        if (hardFilters == null) hardFilters = new HardFilters(null, null, null, null, null, null, null, null, null, null, List.of());
        if (sortBy == null) sortBy = SortBy.RELEVANCE;
    }

    public enum SortBy { RELEVANCE, PRICE_ASC, PRICE_DESC, DISTANCE_ASC }

    public record NumberBounds(@Nullable BigDecimal gte, @Nullable BigDecimal lte,
            @Nullable BigDecimal gt, @Nullable BigDecimal lt) { }

    public record HardFilters(@Nullable String id, @Nullable LocalDate date,
            @Nullable String mensaId, @Nullable String campusId,
            @Nullable String dietTag, @Nullable String kind, @Nullable String service,
            @Nullable NumberBounds priceStudent, @Nullable NumberBounds priceStaff,
            @Nullable NumberBounds priceExternal, List<String> excludeAllergens) {
        public HardFilters {
            if (excludeAllergens == null) excludeAllergens = List.of();
        }
    }
}
