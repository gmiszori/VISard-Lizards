package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.Rating;
import com.visardlizards.backend.repository.MensaRepository;

@Service
public class MealService {

	/** Allowed tags of a meal rating. */
	public static final Set<String> MEAL_TAGS =
			Set.of("tasty", "big-portion", "small-portion", "cold", "too-salty", "worth-it");

	private final MensaRepository mensaRepository;
	private final RatingService ratingService;

	public MealService(MensaRepository mensaRepository, RatingService ratingService) {
		this.mensaRepository = mensaRepository;
		this.ratingService = ratingService;
	}

	/** Diets a meal can have; filtering by vegetarian also returns vegan meals. */
	public static final Set<String> DIETS = Set.of("vegan", "vegetarian", "meat", "fish");

	/**
	 * Meals of all mensas on one day, optionally only of one campus, one diet and without some allergens.
	 * All filters are optional (null or empty = no filter).
	 */
	public List<Meal> searchMeals(LocalDate date, @Nullable String campusId, @Nullable String diet,
			Collection<String> excludedAllergens) {
		if (diet != null && !DIETS.contains(diet)) {
			throw new IllegalArgumentException("Unknown diet: " + diet + ", allowed: " + DIETS);
		}
		Set<String> mensaIds = campusId == null ? null
				: mensaRepository.findAllMensas().stream()
						.filter(mensa -> mensa.campusId().equals(campusId))
						.map(Mensa::id)
						.collect(Collectors.toSet());
		return mensaRepository.findMealsOn(date).stream()
				.filter(meal -> mensaIds == null || mensaIds.contains(meal.mensaId()))
				.filter(meal -> diet == null || meal.dietTag().equals(diet)
						|| (diet.equals("vegetarian") && meal.dietTag().equals("vegan")))
				.filter(meal -> meal.allergens().stream().noneMatch(excludedAllergens::contains))
				.toList();
	}

	public Meal getMeal(String id) {
		return mensaRepository.findMealById(id)
				.orElseThrow(() -> new NotFoundException("Meal not found: " + id));
	}

	/** Saves a user's rating of a meal; each user can rate each meal once (ConflictException otherwise). */
	public Rating rateMeal(String id, String userId, int stars, List<String> tags) {
		for (String tag : tags) {
			// Set.of(...).contains(null) throws, so check null first
			if (tag == null || !MEAL_TAGS.contains(tag)) {
				throw new IllegalArgumentException("Unknown tag: " + tag + ", allowed: " + MEAL_TAGS);
			}
		}
		return ratingService.addUserRating(getMeal(id).id(), userId, stars, Set.copyOf(tags));
	}

	public @Nullable BigDecimal getAverageRating(String mealId) {
		return ratingService.getAverage(mealId);
	}

	public Map<String, Integer> getTagCounts(String mealId) {
		return ratingService.getTagCounts(mealId);
	}

}
