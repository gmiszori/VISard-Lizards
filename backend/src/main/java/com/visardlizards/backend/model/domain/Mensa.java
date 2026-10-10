package com.visardlizards.backend.model.domain;

import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Mensa(
		String id,
		String name,
		String institution,
		String campusId,
		Address address,
		/** Building-level position; null when unknown. */
		@Nullable Coordinates coordinates,
		boolean hasMenu,
		boolean temporarilyClosed,
		/** Keys: mon, tue, wed, thu, fri, sat, sun. */
		Map<String, List<ServiceHours>> openingHours,
		List<Closure> closures,
		/** Live menu source; null when unknown. */
		@Nullable MensaSource source) {

	/** Meal service windows on the given date (empty if closed that day, temporarily closed or in a closure). */
	public List<ServiceHours> serviceHoursOn(LocalDate date) {
		if (temporarilyClosed || closures.stream().anyMatch(closure -> closure.contains(date))) {
			return List.of();
		}
		String weekday = date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT);
		return openingHours.getOrDefault(weekday, List.of());
	}

}
