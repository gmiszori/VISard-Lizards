package com.visardlizards.backend.model.domain;

import java.time.LocalDate;
import java.util.List;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Meal(
		String id,
		String mensaId,
		LocalDate date,
		/** lunch or dinner */
		String service,
		String line,
		String kind,
		String title,
		List<String> components,
		String dietTag,
		@Nullable Price price,
		List<String> allergens,
		/** ETH, e.g. "C+" */
		@Nullable String ecoScore,
		/** UZH: LOW, MEDIUM, HIGH */
		@Nullable String climateImpact,
		List<String> traceAllergens) {
	public Meal {
		traceAllergens = traceAllergens == null ? List.of() : List.copyOf(traceAllergens);
	}
	public Meal(String id, String mensaId, LocalDate date, String service, String line, String kind,
			String title, List<String> components, String dietTag, @Nullable Price price,
			List<String> allergens, @Nullable String ecoScore, @Nullable String climateImpact) {
		this(id, mensaId, date, service, line, kind, title, components, dietTag, price, allergens, ecoScore, climateImpact, List.of());
	}
}
