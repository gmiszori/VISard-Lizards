package com.visardlizards.backend.model.dto;

import java.time.LocalTime;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonFormat;

/** timeStart/timeEnd are null when the mensa publishes no service window for that day. */
public record MealPlanEntryDTO(
		@JsonFormat(pattern = "HH:mm") @Nullable LocalTime timeStart,
		@JsonFormat(pattern = "HH:mm") @Nullable LocalTime timeEnd,
		MealDTO meal) {
}
