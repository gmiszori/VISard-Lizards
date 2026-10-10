package com.visardlizards.backend.model.dto;

import java.time.LocalDate;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;

import com.visardlizards.backend.model.domain.PriceCategory;

/**
 * Request to parse and execute a natural language meal search or execute an already extracted structured query.
 */
public record StructuredMealSearchRequest(
		@Nullable String query,
		@Nullable Double userLat,
		@Nullable Double userLng,
		@Nullable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
		@Nullable String campus,
		@Nullable PriceCategory priceCategory,
		@Nullable StructuredMealQuery structuredQuery) {
}
