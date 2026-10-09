package com.visardlizards.backend.model.domain;

import java.math.BigDecimal;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Price(@Nullable BigDecimal student, @Nullable BigDecimal staff, @Nullable BigDecimal external) {

	public @Nullable BigDecimal of(PriceCategory category) {
		return switch (category) {
			case STUDENT -> student;
			case STAFF -> staff;
			case EXTERNAL -> external;
		};
	}

}
