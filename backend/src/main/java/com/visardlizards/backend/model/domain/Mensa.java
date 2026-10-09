package com.visardlizards.backend.model.domain;

import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Mensa(
		String id,
		String name,
		String institution,
		String campusId,
		Address address,
		boolean hasMenu,
		boolean temporarilyClosed,
		/** Keys: mon, tue, wed, thu, fri, sat, sun. */
		Map<String, List<ServiceHours>> openingHours) {

	/** Meal service windows on the weekday of the given date (empty if closed). */
	public List<ServiceHours> serviceHoursOn(LocalDate date) {
		String weekday = date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT);
		return openingHours.getOrDefault(weekday, List.of());
	}

}
