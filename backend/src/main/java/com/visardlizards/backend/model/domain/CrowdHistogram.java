package com.visardlizards.backend.model.domain;

import java.util.Map;

import org.jspecify.annotations.Nullable;

/**
 * Typical occupancy per weekday (mon..sun) in 15-minute slots: slot start time "HH:mm" (Zurich) -> 0-100,
 * null where there are no reports. byWeekday is null when there are too few reports (sufficient == false).
 */
public record CrowdHistogram(String mensaId, boolean sufficient, int sampleSize,
		@Nullable Map<String, Map<String, @Nullable Integer>> byWeekday) {

	public static final int INTERVAL_MINUTES = 15;

}
