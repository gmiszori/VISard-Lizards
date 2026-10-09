package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

/**
 * Star ratings (and optional tags) of mensas and meals, kept in memory until there is a database.
 * Mensa ids and meal ids never collide, so one store serves both.
 */
@Service
public class RatingService {

	private final Map<String, List<Integer>> starsBySubjectId = new ConcurrentHashMap<>();
	private final Map<String, List<String>> tagsBySubjectId = new ConcurrentHashMap<>();

	public void addRating(String subjectId, int stars) {
		addRating(subjectId, stars, List.of());
	}

	public void addRating(String subjectId, int stars, Collection<String> tags) {
		if (stars < 1 || stars > 5) {
			throw new IllegalArgumentException("stars must be between 1 and 5, was " + stars);
		}
		starsBySubjectId.computeIfAbsent(subjectId, id -> new CopyOnWriteArrayList<>()).add(stars);
		if (!tags.isEmpty()) {
			tagsBySubjectId.computeIfAbsent(subjectId, id -> new CopyOnWriteArrayList<>()).addAll(tags);
		}
	}

	/** Average rounded to one decimal, or null if there are no ratings yet. */
	public @Nullable BigDecimal getAverage(String subjectId) {
		List<Integer> stars = starsBySubjectId.get(subjectId);
		if (stars == null || stars.isEmpty()) {
			return null;
		}
		double average = stars.stream().mapToInt(Integer::intValue).average().orElseThrow();
		return BigDecimal.valueOf(average).setScale(1, RoundingMode.HALF_UP);
	}

	/** How often each tag was given, sorted by tag. */
	public Map<String, Integer> getTagCounts(String subjectId) {
		Map<String, Integer> counts = new TreeMap<>();
		for (String tag : tagsBySubjectId.getOrDefault(subjectId, List.of())) {
			counts.merge(tag, 1, Integer::sum);
		}
		return counts;
	}

}
