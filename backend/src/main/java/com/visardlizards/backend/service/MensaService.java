package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.domain.Address;
import com.visardlizards.backend.model.domain.Campus;
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
import com.visardlizards.backend.repository.MensaRepository;

@Service
public class MensaService {

	/** Opening hours are returned for this many days, starting today. */
	private static final int OPENING_HOURS_DAYS = 7;

	private final MensaRepository mensaRepository;
	private final RatingService ratingService;

	public MensaService(MensaRepository mensaRepository, RatingService ratingService) {
		this.mensaRepository = mensaRepository;
		this.ratingService = ratingService;
	}

	public List<MensaDTO> getMensas(@Nullable String campusId) {
		return mensaRepository.findAllMensas().stream()
				.filter(mensa -> campusId == null || mensa.campusId().equals(campusId))
				.map(mensa -> toMensaDTO(mensa, null))
				.toList();
	}

	public MensaDTO getMensa(String id, LocalDate dateStart, LocalDate dateEnd, PriceCategory priceCategory) {
		Mensa mensa = findMensa(id);
		return toMensaDTO(mensa, toMealPlanDTO(mensa, dateStart, dateEnd, priceCategory));
	}

	public MealPlanDTO getMealPlan(String id, LocalDate dateStart, LocalDate dateEnd, PriceCategory priceCategory) {
		return toMealPlanDTO(findMensa(id), dateStart, dateEnd, priceCategory);
	}

	public void rateMensa(String id, int stars) {
		ratingService.addRating(findMensa(id).id(), stars);
	}

	private Mensa findMensa(String id) {
		return mensaRepository.findMensaById(id)
				.orElseThrow(() -> new NotFoundException("Mensa not found: " + id));
	}

	private MensaDTO toMensaDTO(Mensa mensa, @Nullable MealPlanDTO mealPlan) {
		String campus = mensaRepository.findCampusById(mensa.campusId()).map(Campus::name).orElse(mensa.campusId());
		return new MensaDTO(
				mensa.name(),
				toOpeningHoursDTO(mensa, LocalDate.now()),
				campus,
				formatAddress(mensa.address()),
				ratingService.getAverage(mensa.id()),
				mealPlan);
	}

	private OpeningHoursDTO toOpeningHoursDTO(Mensa mensa, LocalDate from) {
		Map<LocalDate, List<OpeningTimeDTO>> days = new TreeMap<>();
		for (int i = 0; i < OPENING_HOURS_DAYS; i++) {
			LocalDate date = from.plusDays(i);
			days.put(date, serviceHours(mensa, date).stream()
					.map(hours -> new OpeningTimeDTO(hours.open(), hours.close()))
					.toList());
		}
		return new OpeningHoursDTO(days);
	}

	private MealPlanDTO toMealPlanDTO(Mensa mensa, LocalDate dateStart, LocalDate dateEnd, PriceCategory priceCategory) {
		Map<LocalDate, List<MealPlanEntryDTO>> days = mensaRepository.findMeals(mensa.id(), dateStart, dateEnd).stream()
				.collect(Collectors.groupingBy(Meal::date, TreeMap::new,
						Collectors.mapping(meal -> toMealPlanEntryDTO(mensa, meal, priceCategory), Collectors.toList())));
		return new MealPlanDTO(days);
	}

	private MealPlanEntryDTO toMealPlanEntryDTO(Mensa mensa, Meal meal, PriceCategory priceCategory) {
		Optional<ServiceHours> window = serviceHours(mensa, meal.date()).stream()
				.filter(hours -> hours.service().equals(meal.service()))
				.findFirst();
		return new MealPlanEntryDTO(
				window.map(ServiceHours::open).orElse(null),
				window.map(ServiceHours::close).orElse(null),
				toMealDTO(meal, priceCategory));
	}

	private MealDTO toMealDTO(Meal meal, PriceCategory priceCategory) {
		BigDecimal price = meal.price() == null ? null : meal.price().of(priceCategory);
		String description = meal.components().isEmpty() ? null : String.join(", ", meal.components());
		String envImp = meal.ecoScore() != null ? meal.ecoScore() : meal.climateImpact();
		return new MealDTO(
				meal.title(),
				new PriceDTO(price, priceCategory.name().toLowerCase(Locale.ROOT)),
				description,
				meal.allergens(),
				List.of(meal.dietTag(), meal.kind(), meal.service()),
				envImp);
	}

	private static List<ServiceHours> serviceHours(Mensa mensa, LocalDate date) {
		String weekday = date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT);
		return mensa.openingHours().getOrDefault(weekday, List.of());
	}

	private static String formatAddress(Address address) {
		String city = address.postalCode() == null ? address.city() : address.postalCode() + " " + address.city();
		return address.street() + ", " + city;
	}

}
