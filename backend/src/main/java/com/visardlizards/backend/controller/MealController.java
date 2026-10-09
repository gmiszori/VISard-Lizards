package com.visardlizards.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.MealDetailDTO;
import com.visardlizards.backend.model.dto.MealRatingRequestDTO;
import com.visardlizards.backend.service.MealService;

@RestController
@RequestMapping("/api/meals")
public class MealController {

	private final MealService mealService;
	private final MensaDtoMapper mapper;

	public MealController(MealService mealService, MensaDtoMapper mapper) {
		this.mealService = mealService;
		this.mapper = mapper;
	}

	/** id as in MealDTO.id, e.g. "polyterrasse.2026-10-06.lunch.2". */
	@GetMapping("/{id}")
	public MealDetailDTO getMeal(@PathVariable String id,
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		Meal meal = mealService.getMeal(id);
		return new MealDetailDTO(meal.mensaId(), meal.date(), mapper.toMealDTO(meal, priceCategory),
				mealService.getAverageRating(meal.id()), mealService.getTagCounts(meal.id()));
	}

	@PostMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.CREATED)
	public void rateMeal(@PathVariable String id, @RequestBody MealRatingRequestDTO rating) {
		mealService.rateMeal(id, rating.stars(), rating.tags() == null ? List.of() : rating.tags());
	}

}
