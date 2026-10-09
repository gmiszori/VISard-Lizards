package com.visardlizards.backend.model.domain;

import java.util.List;
import java.util.Map;

import org.jspecify.annotations.Nullable;

/**
 * Typical crowd per weekday (mon..sun) and hour of day (index 0-23), 0-100.
 * byWeekday is null when there are too few reports (sufficient == false).
 */
public record CrowdHistogram(String mensaId, boolean sufficient, int sampleSize,
		@Nullable Map<String, List<Integer>> byWeekday) {
}
