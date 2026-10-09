package com.visardlizards.backend.model.domain;

import java.util.List;
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
}
