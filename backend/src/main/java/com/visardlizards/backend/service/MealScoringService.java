package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.PriceCategory;

/**
 * Flexible, adaptive scoring service for dish ranking.
 * Supports explicit criteria (e.g. from GPT or frontend parameters) and
 * automatically adapts scoring weights if criteria keywords are present in the query.
 */
@Service
public class MealScoringService {

	private static final Set<String> PRICE_KEYWORDS =
			Set.of("cheap", "cheaper", "cheapest", "budget", "affordable", "low-price", "lower-price",
					"price", "günstig", "billig", "spar");

	private static final Set<String> ECO_KEYWORDS =
			Set.of("eco", "eco-friendly", "sustainable", "green", "climate", "climate-friendly",
					"nachhaltig", "umwelt", "co2", "environmental");

	private static final Set<String> RATING_KEYWORDS =
			Set.of("rating", "high-rating", "best", "top", "top-rated", "popular", "beliebt",
					"gut", "favorite", "favourite");

	private static final Set<String> PORTION_KEYWORDS =
			Set.of("big-portion", "large", "huge", "hearty", "big", "sättigend", "portion");

	private static final Set<String> TASTE_KEYWORDS =
			Set.of("tasty", "delicious", "worth-it", "lecker", "yummy");

	public double computeScore(Meal meal, PriceCategory priceCategory, @Nullable BigDecimal avgRating,
			@Nullable Map<String, Integer> tagCounts, @Nullable String query,
			@Nullable Collection<String> explicitCriteria) {

		Set<String> activeCriteria = extractCriteria(query, explicitCriteria);
		boolean prioritizePrice = activeCriteria.contains("price");
		boolean prioritizeEco = activeCriteria.contains("eco");
		boolean prioritizeRating = activeCriteria.contains("rating");
		boolean prioritizePortion = activeCriteria.contains("portion");
		boolean prioritizeTaste = activeCriteria.contains("taste");

		double score = 0.0;

		// 1. Text Query Relevance (cleansed of criteria keywords)
		String foodQuery = cleanQuery(query);
		if (foodQuery != null && !foodQuery.isBlank()) {
			String q = foodQuery.toLowerCase(Locale.ROOT);
			String title = meal.title().toLowerCase(Locale.ROOT);
			if (title.equals(q)) {
				score += 10.0;
			} else if (title.startsWith(q) || title.contains(" " + q) || title.contains(q + " ")) {
				score += 7.0;
			} else if (title.contains(q)) {
				score += 5.0;
			} else if (meal.components().stream().anyMatch(c -> c.toLowerCase(Locale.ROOT).contains(q))) {
				score += 3.5;
			} else if (meal.line() != null && meal.line().toLowerCase(Locale.ROOT).contains(q)) {
				score += 2.0;
			}
		} else {
			score += 5.0; // neutral base relevance
		}

		// 2. Affordability / Price Score (dynamically scaled)
		if (meal.price() != null) {
			BigDecimal price = meal.price().of(priceCategory);
			if (price != null) {
				double priceVal = price.doubleValue();
				double priceFactor = Math.max(0.0, (16.0 - priceVal) * 0.5);
				double priceMultiplier = prioritizePrice ? 3.0 : 1.0;
				score += priceFactor * priceMultiplier;
			}
		}

		// 3. Sustainability & Eco Impact (dynamically scaled)
		double ecoPoints = 0.0;
		if ("vegan".equalsIgnoreCase(meal.dietTag())) {
			ecoPoints += 2.5;
		} else if ("vegetarian".equalsIgnoreCase(meal.dietTag())) {
			ecoPoints += 1.5;
		}

		if (meal.ecoScore() != null) {
			switch (meal.ecoScore().toUpperCase(Locale.ROOT)) {
				case "A" -> ecoPoints += 2.0;
				case "B" -> ecoPoints += 1.0;
				case "C" -> ecoPoints += 0.5;
				case "D" -> ecoPoints -= 0.5;
				case "E" -> ecoPoints -= 1.0;
				default -> {}
			}
		} else if (meal.climateImpact() != null) {
			switch (meal.climateImpact().toUpperCase(Locale.ROOT)) {
				case "LOW" -> ecoPoints += 2.0;
				case "MEDIUM" -> ecoPoints += 0.5;
				case "HIGH" -> ecoPoints -= 1.0;
				default -> {}
			}
		}
		double ecoMultiplier = prioritizeEco ? 3.0 : 1.0;
		score += ecoPoints * ecoMultiplier;

		// 4. User Rating Score (dynamically scaled)
		double ratingPoints = avgRating != null ? avgRating.doubleValue() * 2.0 : 6.0;
		double ratingMultiplier = prioritizeRating ? 2.5 : 1.0;
		score += ratingPoints * ratingMultiplier;

		// 5. Community Feedback Tags
		if (tagCounts != null && !tagCounts.isEmpty()) {
			int tasty = tagCounts.getOrDefault("tasty", 0);
			int worthIt = tagCounts.getOrDefault("worth-it", 0);
			int bigPortion = tagCounts.getOrDefault("big-portion", 0);
			int cold = tagCounts.getOrDefault("cold", 0);
			int tooSalty = tagCounts.getOrDefault("too-salty", 0);
			int smallPortion = tagCounts.getOrDefault("small-portion", 0);

			double tasteWeight = prioritizeTaste ? 2.0 : 1.0;
			double portionWeight = prioritizePortion ? 2.0 : 1.0;

			score += Math.min(5.0, (tasty + worthIt) * 0.5 * tasteWeight + bigPortion * 0.5 * portionWeight);
			score -= Math.min(3.0, (cold + tooSalty) * 0.5 + smallPortion * 0.25);
		}

		return Math.round(score * 10.0) / 10.0;
	}

	public double computeScore(Meal meal, PriceCategory priceCategory, @Nullable BigDecimal avgRating,
			@Nullable Map<String, Integer> tagCounts, @Nullable String query) {
		return computeScore(meal, priceCategory, avgRating, tagCounts, query, null);
	}

	private Set<String> extractCriteria(@Nullable String query, @Nullable Collection<String> explicitCriteria) {
		Set<String> result = new HashSet<>();
		if (explicitCriteria != null) {
			for (String c : explicitCriteria) {
				if (c == null) continue;
				String norm = c.trim().toLowerCase(Locale.ROOT);
				if (PRICE_KEYWORDS.contains(norm)) result.add("price");
				if (ECO_KEYWORDS.contains(norm)) result.add("eco");
				if (RATING_KEYWORDS.contains(norm)) result.add("rating");
				if (PORTION_KEYWORDS.contains(norm)) result.add("portion");
				if (TASTE_KEYWORDS.contains(norm)) result.add("taste");
			}
		}
		if (query != null && !query.isBlank()) {
			String[] words = query.trim().toLowerCase(Locale.ROOT).split("\\s+");
			for (String w : words) {
				if (PRICE_KEYWORDS.contains(w)) result.add("price");
				if (ECO_KEYWORDS.contains(w)) result.add("eco");
				if (RATING_KEYWORDS.contains(w)) result.add("rating");
				if (PORTION_KEYWORDS.contains(w)) result.add("portion");
				if (TASTE_KEYWORDS.contains(w)) result.add("taste");
			}
		}
		return result;
	}

	private String cleanQuery(@Nullable String query) {
		if (query == null || query.isBlank()) return null;
		String[] words = query.trim().split("\\s+");
		StringBuilder sb = new StringBuilder();
		for (String w : words) {
			String lower = w.toLowerCase(Locale.ROOT);
			if (!PRICE_KEYWORDS.contains(lower) && !ECO_KEYWORDS.contains(lower)
					&& !RATING_KEYWORDS.contains(lower) && !PORTION_KEYWORDS.contains(lower)
					&& !TASTE_KEYWORDS.contains(lower)) {
				if (!sb.isEmpty()) sb.append(" ");
				sb.append(w);
			}
		}
		return sb.toString().trim();
	}
}
