package com.visardlizards.backend.model.dto;

import java.util.List;
import java.util.Map;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Popular times: 24 hourly values (0-100) per weekday; byWeekday is omitted when sufficient is false. */
public record CrowdHistogramDTO(String mensaId, boolean sufficient, int sampleSize,
		@JsonInclude(JsonInclude.Include.NON_NULL) @Nullable Map<String, List<Integer>> byWeekday) {
}
