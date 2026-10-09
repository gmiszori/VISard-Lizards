package com.visardlizards.backend.model.dto;

import java.time.LocalTime;

import com.fasterxml.jackson.annotation.JsonFormat;

public record MealPlanEntryDTO(
		@JsonFormat(pattern = "HH:mm") LocalTime timeStart,
		@JsonFormat(pattern = "HH:mm") LocalTime timeEnd,
		MealDTO meal) {
}
