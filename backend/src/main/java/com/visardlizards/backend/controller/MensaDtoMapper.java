package com.visardlizards.backend.controller;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

import com.visardlizards.backend.model.domain.Address;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.domain.ServiceHours;
import com.visardlizards.backend.model.dto.MealDTO;
import com.visardlizards.backend.model.dto.MealPlanDTO;
import com.visardlizards.backend.model.dto.MealPlanEntryDTO;
import com.visardlizards.backend.model.dto.MensaDTO;
import com.visardlizards.backend.model.dto.OpeningHoursDTO;
import com.visardlizards.backend.model.dto.OpeningTimeDTO;
import com.visardlizards.backend.model.dto.PriceDTO;
import com.visardlizards.backend.model.dto.PricesDTO;

/** Maps domain models to the DTOs sent to the frontend. */
@Component
public class MensaDtoMapper {

	/** Opening hours are returned for this many days, starting at the given date. */
	private static final int OPENING_HOURS_DAYS = 7;

	public MensaDTO toMensaDTO(Mensa mensa, String campusName, @Nullable BigDecimal avgRating,
			LocalDate openingHoursFrom, @Nullable MealPlanDTO mealPlan) {
		return new MensaDTO(
				mensa.id(),
				mensa.name(),
				toOpeningHoursDTO(mensa, openingHoursFrom),
				campusName,
				formatAddress(mensa.address()),
				avgRating,
				mealPlan);
	}

	public MealPlanDTO toMealPlanDTO(Mensa mensa, List<Meal> meals, PriceCategory priceCategory) {
		// Within a day: lunch before dinner (stable sort keeps the source's line order)
		Map<LocalDate, List<MealPlanEntryDTO>> days = meals.stream()
				.map(meal -> Map.entry(meal.date(), toMealPlanEntryDTO(mensa, meal, priceCategory)))
				.sorted(Comparator.comparing((Map.Entry<LocalDate, MealPlanEntryDTO> e) -> e.getValue().timeStart(),
						Comparator.nullsLast(Comparator.naturalOrder())))
				.collect(Collectors.groupingBy(Map.Entry::getKey, TreeMap::new,
						Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
		return new MealPlanDTO(days);
	}

	private OpeningHoursDTO toOpeningHoursDTO(Mensa mensa, LocalDate from) {
		Map<LocalDate, List<OpeningTimeDTO>> days = new TreeMap<>();
		for (int i = 0; i < OPENING_HOURS_DAYS; i++) {
			LocalDate date = from.plusDays(i);
			days.put(date, mensa.serviceHoursOn(date).stream()
					.map(hours -> new OpeningTimeDTO(hours.open(), hours.close()))
					.toList());
		}
		return new OpeningHoursDTO(days);
	}

	private MealPlanEntryDTO toMealPlanEntryDTO(Mensa mensa, Meal meal, PriceCategory priceCategory) {
		Optional<ServiceHours> window = mensa.serviceHoursOn(meal.date()).stream()
				.filter(hours -> hours.service().equals(meal.service()))
				.findFirst();
		return new MealPlanEntryDTO(
				window.map(ServiceHours::open).orElse(null),
				window.map(ServiceHours::close).orElse(null),
				toMealDTO(meal, priceCategory));
	}

	public MealDTO toMealDTO(Meal meal, PriceCategory priceCategory) {
		BigDecimal price = meal.price() == null ? null : meal.price().of(priceCategory);
		String description = meal.components().isEmpty() ? null : String.join(", ", meal.components());
		String envImp = meal.ecoScore() != null ? meal.ecoScore() : meal.climateImpact();
		return new MealDTO(
				meal.id(),
				meal.title(),
				new PriceDTO(price, priceCategory.name().toLowerCase(Locale.ROOT)),
				meal.price() == null ? new PricesDTO(null, null, null)
						: new PricesDTO(meal.price().student(), meal.price().staff(), meal.price().external()),
				description,
				meal.allergens(),
				List.of(meal.dietTag(), meal.kind(), meal.service()),
				envImp);
	}

	private static String formatAddress(Address address) {
		String city = address.postalCode() == null ? address.city() : address.postalCode() + " " + address.city();
		return address.street() + ", " + city;
	}

}
