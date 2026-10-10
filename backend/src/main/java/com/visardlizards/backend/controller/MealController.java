package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;

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
import com.visardlizards.backend.service.MensaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/meals")
@Tag(name = "Meals", description = "Meal search, single meals and their ratings")
public class MealController {

	private final MealService mealService;
	private final MensaService mensaService;
	private final MensaDtoMapper mapper;
	private final Clock clock;

	public MealController(MealService mealService, MensaService mensaService, MensaDtoMapper mapper, Clock clock) {
		this.mealService = mealService;
		this.mensaService = mensaService;
		this.mapper = mapper;
		this.clock = clock;
	}

	@GetMapping
	@Operation(summary = "Search meals across all mensas", description = """
			Returns the meals of all mensas on one day, for questions like "which vegan meals without gluten
			are there today on Zentrum?". Every filter is optional; without any, all meals of the menu date are
			returned. Each result says which mensa serves it and includes its ratings, like `GET /api/meals/{id}`.
			Results are ordered by mensa.
			""")
	@ApiResponse(responseCode = "200", description = "Matching meals (empty list if none)")
	@ApiResponse(responseCode = "400", description = "Unknown diet or invalid date")
	public List<MealDetailDTO> searchMeals(
			@Parameter(description = "Day to search. Default: the menu date (see `GET /api/meta`)")
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate date,
			@Parameter(description = "Only this campus: `zentrum`, `hoenggerberg` or `irchel`")
			@RequestParam(required = false) @Nullable String campus,
			@Parameter(description = "Only this diet: `vegan`, `vegetarian` (includes vegan), `meat` or `fish`")
			@RequestParam(required = false) @Nullable String diet,
			@Parameter(description = "Comma-separated allergen ids to leave out, e.g. `gluten,milk`")
			@RequestParam(required = false) @Nullable List<String> excludeAllergens,
			@Parameter(description = "Which price to put into each meal")
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		LocalDate day = date != null ? date : mensaService.getMenuDate(LocalDate.now(clock));
		return mealService.searchMeals(day, campus, diet, excludeAllergens == null ? List.of() : excludeAllergens)
				.stream()
				.map(meal -> toDetail(meal, priceCategory))
				.toList();
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
		return toDetail(mealService.getMeal(id), priceCategory);
	}

	@PostMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Rate a meal", description = """
			Saves a user's rating of a meal: stars plus optional tags that say why. Each client (IP
			address) can rate a meal once every 24 hours. The result shows up in `GET /api/meals/{id}`.

			Tags: `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`, `worth-it`.
			A tag listed twice in one rating counts once.
			""")
	@ApiResponse(responseCode = "201", description = "Rating saved (no body)")
	@ApiResponse(responseCode = "400", description = "Stars outside 1-5, unknown tag or invalid body")
	@ApiResponse(responseCode = "404", description = "Unknown meal")
	@ApiResponse(responseCode = "429", description = "This client already rated it in the last 24 hours (see `Retry-After`)")
	public void rateMeal(
			@Parameter(description = "Meal id, e.g. `polyterrasse.2026-10-06.lunch.2`") @PathVariable String id,
			@Valid @RequestBody MealRatingRequestDTO rating) {
		mealService.rateMeal(id, rating.stars(), rating.tags() == null ? List.of() : rating.tags());
	}

	private MealDetailDTO toDetail(Meal meal, PriceCategory priceCategory) {
		return new MealDetailDTO(meal.mensaId(), meal.date(), mapper.toMealDTO(meal, priceCategory),
				mealService.getAverageRating(meal.id()), mealService.getTagCounts(meal.id()));
	}

}
