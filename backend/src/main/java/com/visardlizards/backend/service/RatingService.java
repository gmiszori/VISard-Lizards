package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

/** Mensa ratings, kept in memory until there is a database. */
@Service
public class RatingService {

	private final Map<String, List<Integer>> starsByMensaId = new ConcurrentHashMap<>();

	public void addRating(String mensaId, int stars) {
		if (stars < 1 || stars > 5) {
			throw new IllegalArgumentException("stars must be between 1 and 5, was " + stars);
		}
		starsByMensaId.computeIfAbsent(mensaId, id -> new CopyOnWriteArrayList<>()).add(stars);
	}

	/** Average rounded to one decimal, or null if the mensa has no ratings yet. */
	public @Nullable BigDecimal getAverage(String mensaId) {
		List<Integer> stars = starsByMensaId.get(mensaId);
		if (stars == null || stars.isEmpty()) {
			return null;
		}
		double average = stars.stream().mapToInt(Integer::intValue).average().orElseThrow();
		return BigDecimal.valueOf(average).setScale(1, RoundingMode.HALF_UP);
	}

}
