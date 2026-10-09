package com.visardlizards.backend.model.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Meal plan per day, serialized directly as a map, e.g.
 * <pre>{"2026-01-01": [{"timeStart": "12:00", "timeEnd": "14:00", "meal": {...}}], "2026-01-02": [...]}</pre>
 */
public record MealPlanDTO(@JsonValue Map<LocalDate, List<MealPlanEntryDTO>> days) {

	@JsonCreator(mode = JsonCreator.Mode.DELEGATING)
	public MealPlanDTO {
	}

}
