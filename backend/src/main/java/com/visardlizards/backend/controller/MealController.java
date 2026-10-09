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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/meals")
@Tag(name = "Meals", description = "Single meals and their ratings")
public class MealController {

	private final MealService mealService;
	private final MensaDtoMapper mapper;

	public MealController(MealService mealService, MensaDtoMapper mapper) {
		this.mealService = mealService;
		this.mapper = mapper;
	}

	@GetMapping("/{id}")
	@Operation(summary = "Get one meal with its ratings", description = """
			Returns a single meal with where and when it is served and what users think of it. Use it for a
			meal detail page; the id comes from `meal.id` in a meal plan.

			`avgRating` is `null` until the meal has been rated. `tagCounts` says how many ratings used each
			tag; tags nobody used are left out.
			""")
	@ApiResponse(responseCode = "200", description = "The meal with `mensaId`, `date`, `avgRating` and `tagCounts`")
	@ApiResponse(responseCode = "404", description = "Unknown meal")
	public MealDetailDTO getMeal(
			@Parameter(description = "Meal id, e.g. `polyterrasse.2026-10-06.lunch.2`") @PathVariable String id,
			@Parameter(description = "Which price to put into the meal")
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		Meal meal = mealService.getMeal(id);
		return new MealDetailDTO(meal.mensaId(), meal.date(), mapper.toMealDTO(meal, priceCategory),
				mealService.getAverageRating(meal.id()), mealService.getTagCounts(meal.id()));
	}

	@PostMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Rate a meal", description = """
			Saves a user's rating of a meal: stars plus optional tags that say why. Every call adds one
			rating. The result shows up in `GET /api/meals/{id}`.

			Tags: `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`, `worth-it`.
			A tag listed twice in one rating counts once.
			""")
	@ApiResponse(responseCode = "201", description = "Rating saved (no body)")
	@ApiResponse(responseCode = "400", description = "Stars outside 1-5, unknown tag or invalid body")
	@ApiResponse(responseCode = "404", description = "Unknown meal")
	public void rateMeal(
			@Parameter(description = "Meal id, e.g. `polyterrasse.2026-10-06.lunch.2`") @PathVariable String id,
			@Valid @RequestBody MealRatingRequestDTO rating) {
		mealService.rateMeal(id, rating.stars(), rating.tags() == null ? List.of() : rating.tags());
	}

}
