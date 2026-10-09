package com.visardlizards.backend.model.dto;

import java.util.List;
import java.util.Map;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Matches CrowdHistogram in frontend/MARTIN/src/lib/types.ts. */
public record CrowdHistogramDTO(String mensaId, boolean sufficient, int sampleSize,
		@JsonInclude(JsonInclude.Include.NON_NULL) @Nullable Map<String, List<Integer>> byWeekday) {
}
