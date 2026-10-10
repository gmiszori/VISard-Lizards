package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

/** id: use it for GET /api/meals/{id} and meal ratings (not on the whiteboard, added for that). */
public record MealDTO(
		String id,
		String name,
		/** The price of the requested priceCategory (whiteboard format). */
		PriceDTO price,
		/** All three prices, for clients that pick the category themselves. */
		PricesDTO prices,
		@Nullable String description,
		List<String> allergens,
		List<String> classification,
		// TODO: type not yet defined (environmental impact)
		@Nullable String envImp) {
}
