package com.visardlizards.backend.controller;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.MealPlanDTO;
import com.visardlizards.backend.model.dto.MensaDTO;
import com.visardlizards.backend.model.dto.RatingRequestDTO;
import com.visardlizards.backend.service.MensaService;

@RestController
@RequestMapping("/api/mensas")
public class MensaController {

	private final MensaService mensaService;

	public MensaController(MensaService mensaService) {
		this.mensaService = mensaService;
	}

	/** All mensas without meal plan, optionally filtered by campus (zentrum, hoenggerberg, irchel). */
	@GetMapping
	public List<MensaDTO> getMensas(@RequestParam(required = false) @Nullable String campus) {
		return mensaService.getMensas(campus);
	}

	/** One mensa including its meal plan (default: today). */
	@GetMapping("/{id}")
	public MensaDTO getMensa(
			@PathVariable String id,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate dateStart,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate dateEnd,
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		LocalDate start = dateStart != null ? dateStart : LocalDate.now();
		return mensaService.getMensa(id, start, dateEnd != null ? dateEnd : start, priceCategory);
	}

	/** Meal plan between dateStart and dateEnd (inclusive), keyed by date. */
	@GetMapping("/{id}/meal-plan")
	public MealPlanDTO getMealPlan(
			@PathVariable String id,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateStart,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateEnd,
			@RequestParam(defaultValue = "STUDENT") PriceCategory priceCategory) {
		if (dateEnd.isBefore(dateStart)) {
			throw new IllegalArgumentException("dateEnd must not be before dateStart");
		}
		return mensaService.getMealPlan(id, dateStart, dateEnd, priceCategory);
	}

	@PostMapping("/{id}/ratings")
	@ResponseStatus(HttpStatus.CREATED)
	public void rateMensa(@PathVariable String id, @RequestBody RatingRequestDTO rating) {
		mensaService.rateMensa(id, rating.stars());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	@ResponseStatus(HttpStatus.BAD_REQUEST)
	public String handleBadRequest(IllegalArgumentException e) {
		return e.getMessage();
	}

}
