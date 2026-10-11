package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.domain.Rating;
import com.visardlizards.backend.model.dto.MealDetailDTO;
import com.visardlizards.backend.model.dto.MealRatingDTO;
import com.visardlizards.backend.model.dto.MealRatingRequestDTO;
import com.visardlizards.backend.service.MealScoringService;
import com.visardlizards.backend.service.MealService;
import com.visardlizards.backend.service.MensaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/meals")
@Tag(name = "Meals", description = "Meal search, single meals and their ratings")
public class MealController {

	public static final Set<String> ALLOWED_SORTS =
			Set.of("mensa", "score", "relevance", "rating", "price", "price_asc", "price_desc", "name", "eco");

	private final MealService mealService;
	private final MensaService mensaService;
	private final MensaDtoMapper mapper;
	private final MealScoringService scoringService;
	private final Clock clock;

	public MealController(MealService mealService, MensaService mensaService, MensaDtoMapper mapper,
			MealScoringService scoringService, Clock clock) {
		this.mealService = mealService;
		this.mensaService = mensaService;
		this.mapper = mapper;
		this.scoringService = scoringService;
		this.clock = clock;
	}

	@GetMapping
	@Operation(summary = "Search meals across all mensas", description = """
			Returns the meals of all mensas on one day, for questions like "which vegan meals without gluten
			are there today on Zentrum?". Every filter is optional; without any, all meals of the menu date are
			returned. Each result says which mensa serves it and includes its ratings and score, like `GET /api/meals/{id}`.
			Supports optional free-text search query and sorting criteria (`mensa`, `score`, `rating`, `price_asc`, `price_desc`, `name`, `eco`).
			""")
	@ApiResponse(responseCode = "200", description = "Matching meals (empty list if none)")
	@ApiResponse(responseCode = "400", description = "Unknown diet, invalid sortBy, or invalid date")
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
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory,
			@Parameter(description = "Optional text search query to filter dishes by name or ingredients")
			@RequestParam(required = false) @Nullable String query,
			@Parameter(description = "Optional explicit ranking criteria (e.g. `cheap`, `eco`, `rating`, `portion`, `taste`)")
			@RequestParam(required = false) @Nullable List<String> criteria,
			@Parameter(description = "Sort criteria: `mensa` (default), `score`, `rating`, `price_asc`, `price_desc`, `name`, `eco`")
			@RequestParam(required = false) @Nullable String sortBy) {
		if (sortBy != null && !sortBy.isBlank() && !ALLOWED_SORTS.contains(sortBy.trim().toLowerCase(Locale.ROOT))) {
			throw new IllegalArgumentException("Unknown sortBy: " + sortBy + ", allowed: " + ALLOWED_SORTS);
		}
		LocalDate day = date != null ? date : mensaService.getMenuDate(LocalDate.now(clock));
		List<MealDetailDTO> details = mealService.searchMeals(day, campus, diet,
						excludeAllergens == null ? List.of() : excludeAllergens)
				.stream()
				.map(meal -> toDetail(meal, priceCategory, query, criteria))
				.toList();

		boolean hasScoringIntent = (query != null && !query.isBlank()) || (criteria != null && !criteria.isEmpty());
		String sort = sortBy != null && !sortBy.isBlank() ? sortBy.trim().toLowerCase(Locale.ROOT)
				: (hasScoringIntent ? "score" : "mensa");
		return sortMeals(details, sort);
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
			Saves a user's rating of a meal: 1-5 stars plus optional tags that say why. Users are identified
			by the trusted `X-User-Id` header set by the reverse proxy when present; otherwise the anonymous id
			in the request is used for local development. Each user can rate each meal
			once; a second rating returns 409. The result shows up in `GET /api/meals/{id}`.

			Tags: `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`, `worth-it`.
			A tag listed twice in one rating counts once.

			`source` (optional) says how the app knows the user ate there: `location` (located at the mensa),
			`crowd` (reported its crowd) or `guess` (picked it when asked where they ate). Ratings with `crowd`
			or `guess` count half in `avgRating`; all others count fully.
			""")
	@ApiResponse(responseCode = "201", description = "The saved rating, with the meal's mensa and date")
	@ApiResponse(responseCode = "400", description = "Missing or invalid userId, stars outside 1-5, unknown tag or source, or invalid body")
	@ApiResponse(responseCode = "404", description = "Unknown meal")
	@ApiResponse(responseCode = "409", description = "This user already rated this meal")
	public MealRatingDTO rateMeal(
			@Parameter(description = "Meal id, e.g. `polyterrasse.2026-10-06.lunch.2`") @PathVariable String id,
			@RequestHeader(name = "X-User-Id", required = false) @Nullable String trustedUserId,
			@Valid @RequestBody MealRatingRequestDTO rating) {
		Meal meal = mealService.getMeal(id);
		String userId = resolveUserId(trustedUserId, rating.userId());
		Rating saved = mealService.rateMeal(id, userId, rating.stars(),
				rating.tags() == null ? List.of() : rating.tags(), rating.source());
		return new MealRatingDTO(meal.id(), meal.mensaId(), meal.date(), userId, saved.stars(), saved.tags(),
				saved.createdAt(), saved.source());
	}

	@DeleteMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Take back a meal rating", description = """
			Deletes this user's rating of the meal ("undo"). The trusted `X-User-Id` header set by the reverse proxy
			takes precedence over the request parameter, so `avgRating` and `tagCounts` no longer count it and
			the user can rate the meal again.
			""")
	@ApiResponse(responseCode = "204", description = "Deleted")
	@ApiResponse(responseCode = "400", description = "Missing or invalid userId")
	@ApiResponse(responseCode = "404", description = "Unknown meal, or this user has not rated it")
	public void unrateMeal(
			@Parameter(description = "Meal id, e.g. `polyterrasse.2026-10-06.lunch.2`") @PathVariable String id,
			@RequestHeader(name = "X-User-Id", required = false) @Nullable String trustedUserId,
			@Parameter(description = "The anonymous user id the rating was saved with (`anon:` + UUID)")
			@RequestParam @Pattern(regexp = "anon:[0-9a-fA-F-]{36}", message = "must be \"anon:\" followed by a UUID") String userId) {
		mealService.unrateMeal(id, resolveUserId(trustedUserId, userId));
	}

	private String resolveUserId(@Nullable String trustedUserId, String fallbackUserId) {
		if (trustedUserId == null) return fallbackUserId;
		String userId = trustedUserId.trim();
		if (userId.isEmpty() || userId.length() > 80) {
			throw new IllegalArgumentException("Invalid X-User-Id header");
		}
		return userId;
	}

	private MealDetailDTO toDetail(Meal meal, PriceCategory priceCategory) {
		return toDetail(meal, priceCategory, null, null);
	}

	private MealDetailDTO toDetail(Meal meal, PriceCategory priceCategory, @Nullable String query,
			@Nullable List<String> criteria) {
		BigDecimal avgRating = mealService.getAverageRating(meal.id());
		Map<String, Integer> tagCounts = mealService.getTagCounts(meal.id());
		double score = scoringService.computeScore(meal, priceCategory, avgRating, tagCounts, query, criteria);
		return new MealDetailDTO(meal.mensaId(), meal.date(), mapper.toMealDTO(meal, priceCategory),
				avgRating, tagCounts, score);
	}

	private List<MealDetailDTO> sortMeals(List<MealDetailDTO> list, String sort) {
		return switch (sort) {
			case "score", "relevance" -> list.stream()
					.sorted(Comparator.comparing(MealDetailDTO::score, Comparator.nullsLast(Comparator.reverseOrder()))
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			case "rating" -> list.stream()
					.sorted(Comparator.comparing(MealDetailDTO::avgRating, Comparator.nullsLast(Comparator.reverseOrder()))
							.thenComparing(MealDetailDTO::score, Comparator.nullsLast(Comparator.reverseOrder()))
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			case "price", "price_asc" -> list.stream()
					.sorted(Comparator.comparing((MealDetailDTO d) -> d.meal().price().price(),
									Comparator.nullsLast(Comparator.naturalOrder()))
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			case "price_desc" -> list.stream()
					.sorted(Comparator.comparing((MealDetailDTO d) -> d.meal().price().price(),
									Comparator.nullsLast(Comparator.reverseOrder()))
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			case "name" -> list.stream()
					.sorted(Comparator.comparing((MealDetailDTO d) -> d.meal().name(), String.CASE_INSENSITIVE_ORDER)
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			case "eco" -> list.stream()
					.sorted(Comparator.comparingInt(this::ecoRank).reversed()
							.thenComparing(MealDetailDTO::mensaId))
					.toList();
			default -> list; // "mensa" preserves natural order by mensa
		};
	}

	private int ecoRank(MealDetailDTO dto) {
		int rank = 0;
		if (dto.meal().classification() != null) {
			if (dto.meal().classification().contains("vegan")) {
				rank += 10;
			} else if (dto.meal().classification().contains("vegetarian")) {
				rank += 5;
			}
		}
		String env = dto.meal().envImp();
		if (env != null) {
			switch (env.toUpperCase(Locale.ROOT)) {
				case "A", "LOW" -> rank += 4;
				case "B" -> rank += 2;
				case "C", "MEDIUM" -> rank += 1;
				default -> {}
			}
		}
		return rank;
	}

}
