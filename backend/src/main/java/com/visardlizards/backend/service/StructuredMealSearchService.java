package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.controller.MensaDtoMapper;
import com.visardlizards.backend.model.domain.Coordinates;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.MealDTO;
import com.visardlizards.backend.model.dto.StructuredMealQuery;
import com.visardlizards.backend.model.dto.StructuredMealResultDTO;
import com.visardlizards.backend.model.dto.StructuredMealSearchRequest;
import com.visardlizards.backend.model.dto.StructuredMealSearchResponse;
import com.visardlizards.backend.repository.MensaRepository;

/**
 * Executes structured meal queries against the database with strict hard constraints (e.g. price <= 15 CHF,
 * fish diet), semantic dish matching across fish varieties, and dynamic ranking prioritizing lower price
 * and closer distance.
 */
@Service
public class StructuredMealSearchService {

	private static final double EARTH_RADIUS_M = 6_371_008.8;

	private final MensaRepository mensaRepository;
	private final MensaService mensaService;
	private final MealService mealService;
	private final MensaDtoMapper mapper;
	private final OpenAiQueryParserService queryParser;
	private final Clock clock;

	public StructuredMealSearchService(
			MensaRepository mensaRepository,
			MensaService mensaService,
			MealService mealService,
			MensaDtoMapper mapper,
			OpenAiQueryParserService queryParser,
			Clock clock) {
		this.mensaRepository = mensaRepository;
		this.mensaService = mensaService;
		this.mealService = mealService;
		this.mapper = mapper;
		this.queryParser = queryParser;
		this.clock = clock;
	}

	public StructuredMealSearchResponse search(StructuredMealSearchRequest request) {
		StructuredMealQuery query = request.structuredQuery();
		if (query == null) {
			query = queryParser.parse(request.query() == null ? "" : request.query());
		}

		LocalDate day = request.date() != null ? request.date() : mensaService.getMenuDate(LocalDate.now(clock));
		PriceCategory category = request.priceCategory() != null ? request.priceCategory() : PriceCategory.STUDENT;

		Map<String, Mensa> mensaMap = mensaRepository.findAllMensas().stream()
				.collect(Collectors.toMap(Mensa::id, m -> m, (a, b) -> a));

		List<Meal> meals = MealQuality.readable(mensaRepository.findMealsOn(day));

		StructuredMealQuery finalQuery = query;
		Double userLat = request.userLat();
		Double userLng = request.userLng();
		String targetCampus = request.campus() != null ? request.campus() : query.campus();

		List<StructuredMealResultDTO> matched = meals.stream()
				.filter(meal -> satisfiesHardConstraints(meal, finalQuery, targetCampus, category, mensaMap))
				.map(meal -> toResult(meal, finalQuery, category, mensaMap.get(meal.mensaId()), userLat, userLng))
				.sorted(Comparator.comparingDouble(StructuredMealResultDTO::score).reversed()
						.thenComparing(r -> r.price() != null ? r.price() : 999.0)
						.thenComparing(r -> r.distanceM() != null ? r.distanceM() : 99999.0))
				.toList();

		return new StructuredMealSearchResponse(query, matched.size(), matched, userLat, userLng);
	}

	private boolean satisfiesHardConstraints(
			Meal meal,
			StructuredMealQuery query,
			@Nullable String campusFilter,
			PriceCategory category,
			Map<String, Mensa> mensaMap) {

		// 1. Campus Constraint
		if (campusFilter != null && !campusFilter.isBlank()) {
			Mensa mensa = mensaMap.get(meal.mensaId());
			if (mensa == null || !campusFilter.equalsIgnoreCase(mensa.campusId())) {
				return false;
			}
		}

		// 2. Hard Budget Constraint (Max Price)
		BigDecimal price = meal.price() == null ? null : meal.price().of(category);
		if (query.maxPrice() != null) {
			if (price == null || price.doubleValue() > query.maxPrice()) {
				return false;
			}
		}

		// 3. Minimum Price Constraint (if any)
		if (query.minPrice() != null) {
			if (price == null || price.doubleValue() < query.minPrice()) {
				return false;
			}
		}

		// 4. Allergen Exclusion Constraint
		if (query.excludeAllergens() != null && !query.excludeAllergens().isEmpty()) {
			for (String excluded : query.excludeAllergens()) {
				if (meal.allergens().stream().anyMatch(a -> a.equalsIgnoreCase(excluded))) {
					return false;
				}
			}
		}

		// 5. Diet Constraint
		if (query.diet() != null && !query.diet().isBlank()) {
			String diet = query.diet().toLowerCase(Locale.ROOT);
			if (diet.equals("fish")) {
				boolean isTaggedFish = "fish".equalsIgnoreCase(meal.dietTag());
				boolean containsFish = isFishLike(meal, query.searchTerms());
				if (!isTaggedFish && !containsFish) {
					return false;
				}
			} else if (diet.equals("vegan")) {
				if (!"vegan".equalsIgnoreCase(meal.dietTag())) {
					return false;
				}
			} else if (diet.equals("vegetarian")) {
				if (!"vegetarian".equalsIgnoreCase(meal.dietTag()) && !"vegan".equalsIgnoreCase(meal.dietTag())) {
					return false;
				}
			} else if (diet.equals("meat")) {
				if (!"meat".equalsIgnoreCase(meal.dietTag()) && !"fish".equalsIgnoreCase(meal.dietTag())) {
					return false;
				}
			}
		}

		return true;
	}

	private boolean isFishLike(Meal meal, List<String> searchTerms) {
		String text = (meal.title() + " " + (meal.line() == null ? "" : meal.line()) + " " + String.join(" ", meal.components()))
				.toLowerCase(Locale.ROOT);
		List<String> fishWords = List.of(
				"fish", "fisch", "salmon", "lachs", "trout", "forelle", "tuna", "thunfisch",
				"cod", "kabeljau", "dorsch", "seelachs", "dorade", "pike", "hecht", "zander",
				"seafood", "meeresfrüchte", "crevette", "garnele", "shrimp", "saibling", "felchen", "barsch");

		for (String w : fishWords) {
			if (text.contains(w)) return true;
		}
		for (String term : searchTerms) {
			if (!term.isBlank() && text.contains(term.toLowerCase(Locale.ROOT))) {
				for (String w : fishWords) {
					if (term.contains(w) || w.contains(term)) return true;
				}
			}
		}
		return false;
	}

	private StructuredMealResultDTO toResult(
			Meal meal,
			StructuredMealQuery query,
			PriceCategory category,
			@Nullable Mensa mensa,
			@Nullable Double userLat,
			@Nullable Double userLng) {

		MealDTO mealDTO = mapper.toMealDTO(meal, category);
		BigDecimal avgRating = mealService.getAverageRating(meal.id());
		Map<String, Integer> tagCounts = mealService.getTagCounts(meal.id());

		Double distanceM = null;
		if (userLat != null && userLng != null && mensa != null && mensa.coordinates() != null) {
			distanceM = calculateDistanceM(userLat, userLng, mensa.coordinates().lat(), mensa.coordinates().lng());
		}

		Double price = mealDTO.price() != null && mealDTO.price().price() != null
				? mealDTO.price().price().doubleValue() : null;

		double score = calculateScore(meal, mealDTO, price, distanceM, avgRating, tagCounts, query);

		String mensaName = mensa != null ? mensa.name() : meal.mensaId();
		String campus = mensa != null ? mensa.campusId() : "";

		String matchReason = buildMatchReason(meal, price, distanceM, score, query);

		return new StructuredMealResultDTO(
				meal.mensaId(),
				mensaName,
				campus,
				distanceM != null ? Math.round(distanceM * 10.0) / 10.0 : null,
				meal.date(),
				mealDTO,
				avgRating,
				tagCounts,
				Math.round(score * 10.0) / 10.0,
				price,
				matchReason);
	}

	private double calculateScore(
			Meal meal,
			MealDTO mealDTO,
			@Nullable Double price,
			@Nullable Double distanceM,
			@Nullable BigDecimal avgRating,
			Map<String, Integer> tagCounts,
			StructuredMealQuery query) {

		double score = 10.0; // base score

		// 1. Lower Price Scoring: lower price gives higher points!
		if (price != null) {
			double affordability = Math.max(0.0, (18.0 - price) * 1.5);
			double priceMultiplier = query.prioritizePrice() ? 3.5 : 1.2;
			score += affordability * priceMultiplier;
		}

		// 2. Lower Distance Scoring: shorter distance gives higher points!
		if (distanceM != null) {
			double proximity = Math.max(0.0, (3000.0 - distanceM) / 100.0);
			double distanceMultiplier = query.prioritizeDistance() ? 3.5 : 1.0;
			score += proximity * distanceMultiplier;
		} else {
			score += 5.0; // neutral distance bonus if location unknown
		}

		// 3. Search Terms / Dish Keyword Relevance (e.g. types of fish)
		String titleLower = meal.title().toLowerCase(Locale.ROOT);
		String compLower = meal.components().stream().map(c -> c.toLowerCase(Locale.ROOT)).collect(Collectors.joining(" "));

		for (String term : query.searchTerms()) {
			if (term.isBlank()) continue;
			String t = term.toLowerCase(Locale.ROOT);
			if (titleLower.contains(t)) {
				score += 8.0;
			} else if (compLower.contains(t)) {
				score += 4.0;
			}
		}

		// 4. Rating & Tag Feedback
		double ratingVal = avgRating != null ? avgRating.doubleValue() : 3.0;
		double ratingMultiplier = query.prioritizeRating() ? 2.5 : 1.0;
		score += ratingVal * 2.0 * ratingMultiplier;

		if (tagCounts != null && !tagCounts.isEmpty()) {
			int tasty = tagCounts.getOrDefault("tasty", 0);
			int worthIt = tagCounts.getOrDefault("worth-it", 0);
			score += Math.min(6.0, (tasty + worthIt) * 0.75);
		}

		return score;
	}

	private String buildMatchReason(
			Meal meal,
			@Nullable Double price,
			@Nullable Double distanceM,
			double score,
			StructuredMealQuery query) {

		StringBuilder sb = new StringBuilder();
		if ("fish".equalsIgnoreCase(query.diet())) {
			sb.append("Fish selection");
		} else if (query.diet() != null) {
			sb.append(query.diet()).append(" dish");
		} else {
			sb.append("Matching meal");
		}

		if (price != null) {
			sb.append(" · CHF ").append(String.format(Locale.ROOT, "%.2f", price));
			if (query.maxPrice() != null) {
				sb.append(" (≤ ").append(String.format(Locale.ROOT, "%.2f", query.maxPrice())).append(")");
			}
		}

		if (distanceM != null) {
			if (distanceM < 1000) {
				sb.append(" · ").append(Math.round(distanceM)).append(" m away");
			} else {
				sb.append(" · ").append(String.format(Locale.ROOT, "%.1f", distanceM / 1000.0)).append(" km away");
			}
		}

		return sb.toString();
	}

	public static double calculateDistanceM(double lat1, double lng1, double lat2, double lng2) {
		double dLat = Math.toRadians(lat2 - lat1);
		double dLng = Math.toRadians(lng2 - lng1);
		double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
				+ Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
		return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(h)));
	}
}
