package com.visardlizards.backend.model.dto;

import java.util.Map;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Popular times in 15-minute slots, in the shape of the frontend's CrowdPrediction (frontend/src/crowd):
 * byWeekday.mon = {"11:00": 25, "11:15": null, ...}, Zurich start times, 0-100, null = unknown.
 * byWeekday is omitted when sufficient is false.
 */
public record CrowdHistogramDTO(String mensaId, boolean sufficient, int sampleSize, int intervalMinutes,
		String timeZone,
		@JsonInclude(JsonInclude.Include.NON_NULL) @Nullable Map<String, Map<String, @Nullable Integer>> byWeekday) {
}
