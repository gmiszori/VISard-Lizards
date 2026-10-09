package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.domain.Meal;
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

	public Meal getMeal(String id) {
		return mensaRepository.findMealById(id)
				.orElseThrow(() -> new NotFoundException("Meal not found: " + id));
	}

	public void rateMeal(String id, int stars, List<String> tags) {
		for (String tag : tags) {
			// Set.of(...).contains(null) throws, so check null first
			if (tag == null || !MEAL_TAGS.contains(tag)) {
				throw new IllegalArgumentException("Unknown tag: " + tag + ", allowed: " + MEAL_TAGS);
			}
		}
		ratingService.addRating(getMeal(id).id(), stars, Set.copyOf(tags));
	}

	public @Nullable BigDecimal getAverageRating(String mealId) {
		return ratingService.getAverage(mealId);
	}

	public Map<String, Integer> getTagCounts(String mealId) {
		return ratingService.getTagCounts(mealId);
	}

}
