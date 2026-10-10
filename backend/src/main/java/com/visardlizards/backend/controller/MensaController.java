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

import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.MealPlanDTO;
import com.visardlizards.backend.model.dto.MensaDTO;
import com.visardlizards.backend.model.dto.RatingRequestDTO;
import com.visardlizards.backend.service.MensaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/mensas")
@Tag(name = "Mensas", description = "Mensas, their opening hours, meal plans and ratings")
public class MensaController {

	private final MensaService mensaService;
	private final MensaDtoMapper mapper;
	private final Clock clock;

	public MensaController(MensaService mensaService, MensaDtoMapper mapper, Clock clock) {
		this.mensaService = mensaService;
		this.mapper = mapper;
		this.clock = clock;
	}

	@GetMapping
	@Operation(summary = "List all mensas", description = """
			Returns every mensa as a list, sorted by name. Use it for overview pages: each
			entry has the mensa's name, campus, address, average user rating and its opening hours for the
			next 7 days starting today. The meal plan is left out (`mealPlan` is `null`) to keep the response
			small; load it with `GET /api/mensas/{id}` when a mensa is opened.

			- `openingHours` maps each of the next 7 days to the meal service windows of that day. A closed
			  day has an empty list: weekends, company holidays and mensas that are temporarily closed.
			- `avgRating` is the average of all user ratings, rounded to one decimal, or `null` if nobody has
			  rated the mensa yet.
			- `coordinates` is the WGS84 position (`lat`, `lng`) accurate to the building, or `null` if unknown.
			""")
	@ApiResponse(responseCode = "200", description = "The mensas (without meal plan)")
	public List<MensaDTO> getMensas(
			@Parameter(description = "Only mensas of this campus: `zentrum`, `hoenggerberg` or `irchel` "
					+ "(see `GET /api/campuses`). An unknown campus gives an empty list.")
			@RequestParam(required = false) @Nullable String campus) {
		LocalDate today = LocalDate.now(clock);
		return mensaService.getMensas(campus).stream()
				.map(mensa -> toMensaDTO(mensa, today, null))
				.toList();
	}

	@GetMapping("/{id}")
	@Operation(summary = "Get one mensa with its meal plan", description = """
			Returns one mensa with everything `GET /api/mensas` returns, plus its meal plan.
			Without dates, the meal plan covers the menu date, so a mensa page always shows the most recent
			menu available. Pass dates to show another day or a whole week.
			""")
	@ApiResponse(responseCode = "200", description = "The mensa with `mealPlan` filled")
	@ApiResponse(responseCode = "400", description = "`dateEnd` is before `dateStart`, or a parameter is invalid")
	@ApiResponse(responseCode = "404", description = "Unknown mensa")
	public MensaDTO getMensa(
			@Parameter(description = "Mensa id, e.g. `polyterrasse`") @PathVariable String id,
			@Parameter(description = "First day of the meal plan. Default: the menu date")
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate dateStart,
			@Parameter(description = "Last day of the meal plan (inclusive). Default: `dateStart`")
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate dateEnd,
			@Parameter(description = "Which price to put into each meal")
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		LocalDate today = LocalDate.now(clock);
		LocalDate start = dateStart != null ? dateStart : mensaService.getMenuDate(today);
		Mensa mensa = mensaService.getMensa(id);
		return toMensaDTO(mensa, today, getMealPlan(id, start, dateEnd != null ? dateEnd : start, priceCategory));
	}

	@GetMapping("/{id}/meal-plan")
	@Operation(summary = "Get the meal plan of a mensa for a date range", description = """
			Returns only the meal plan of a mensa between two days, both included. Each day maps to its meals;
			days without any meals (weekends, holidays, days outside the data) are left out of the response.
			Within a day, lunch comes before dinner, and each entry says when that meal is served
			(`timeStart`/`timeEnd`, `null` if the mensa publishes no service window for that day).

			**Meal fields**
			- `id`: for `GET /api/meals/{id}`.
			- `price.price`: the price in CHF for the requested `priceCategory` (`price.cat`), `null` when the
			  source has no price.
			- `description`: the meal's components joined with commas, `null` if there are none.
			- `allergens`: EU allergen ids such as `gluten`, `milk`, `soy`.
			- `classification`: `[diet, kind, service]`, where diet is `vegan`/`vegetarian`/`meat`/`fish`,
			  kind is `main`/`buffet`/`dessert`/`drink` and service is `lunch`/`dinner`.
			- `envImp`: environmental impact, the ETH eco score (e.g. `C+`) or the UZH climate impact
			  (`LOW`/`MEDIUM`/`HIGH`), `null` if unknown.
			""")
	@ApiResponse(responseCode = "200", description = "Meals keyed by date, e.g. "
			+ "`{\"2026-10-06\": [{\"timeStart\": \"11:00\", \"timeEnd\": \"14:00\", \"meal\": {...}}]}`")
	@ApiResponse(responseCode = "400", description = "Missing or invalid date, or `dateEnd` before `dateStart`")
	@ApiResponse(responseCode = "404", description = "Unknown mensa")
	public MealPlanDTO getMealPlan(
			@Parameter(description = "Mensa id, e.g. `polyterrasse`") @PathVariable String id,
			@Parameter(description = "First day") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateStart,
			@Parameter(description = "Last day (inclusive)") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateEnd,
			@Parameter(description = "Which price to put into each meal")
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		return mapper.toMealPlanDTO(mensaService.getMensa(id), mensaService.getMeals(id, dateStart, dateEnd), priceCategory);
	}

	@PostMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Rate a mensa", description = """
			Saves a user's star rating of a mensa. Every call adds one rating; there are no user accounts, but
			each client (IP address) can rate a mensa once every 24 hours. The new average shows up as `avgRating` in the mensa
			endpoints.
			""")
	@ApiResponse(responseCode = "201", description = "Rating saved (no body)")
	@ApiResponse(responseCode = "400", description = "Stars outside 1-5 or invalid body")
	@ApiResponse(responseCode = "404", description = "Unknown mensa")
	@ApiResponse(responseCode = "429", description = "This client already rated it in the last 24 hours (see `Retry-After`)")
	public void rateMensa(@Parameter(description = "Mensa id, e.g. `polyterrasse`") @PathVariable String id,
			@Valid @RequestBody RatingRequestDTO rating) {
		mensaService.rateMensa(id, rating.stars());
	}

	private MensaDTO toMensaDTO(Mensa mensa, LocalDate today, @Nullable MealPlanDTO mealPlan) {
		return mapper.toMensaDTO(mensa, mensaService.getCampusName(mensa), mensaService.getAverageRating(mensa.id()),
				today, mealPlan);
	}

}
