package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

public record MealDTO(
		String name,
		PriceDTO price,
		@Nullable String description,
		List<String> allergens,
		List<String> classification,
		// TODO: type not yet defined (environmental impact)
		@Nullable String envImp) {
}
