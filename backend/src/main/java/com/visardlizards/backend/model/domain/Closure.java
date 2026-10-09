package com.visardlizards.backend.model.domain;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** A period (inclusive) in which the mensa is closed, e.g. company holidays. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Closure(LocalDate from, LocalDate to, String note) {

	public boolean contains(LocalDate date) {
		return !date.isBefore(from) && !date.isAfter(to);
	}

}
