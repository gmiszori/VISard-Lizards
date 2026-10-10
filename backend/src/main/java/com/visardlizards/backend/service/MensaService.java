package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.SortedSet;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.domain.Campus;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.repository.MensaRepository;

@Service
public class MensaService {

	private final MensaRepository mensaRepository;
	private final RatingService ratingService;
	private final ScrapedMenuRefreshService scraped;

	public MensaService(MensaRepository mensaRepository, RatingService ratingService, ScrapedMenuRefreshService scraped) {
		this.mensaRepository = mensaRepository;
		this.ratingService = ratingService;
		this.scraped = scraped;
	}

	/** All mensas, optionally only those of one campus. */
	public List<Mensa> getMensas(@Nullable String campusId) {
		return mensaRepository.findAllMensas().stream()
				.filter(mensa -> campusId == null || mensa.campusId().equals(campusId))
				.toList();
	}

	public Mensa getMensa(String id) {
		return mensaRepository.findMensaById(id)
				.orElseThrow(() -> new NotFoundException("Mensa not found: " + id));
	}

	/** Meals of a mensa between both dates (inclusive). */
	public List<Meal> getMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd) {
		if (dateEnd.isBefore(dateStart)) {
			throw new IllegalArgumentException("dateEnd must not be before dateStart");
		}
		getMensa(mensaId);
		var existing=MealQuality.readable(mensaRepository.findMeals(mensaId, dateStart, dateEnd));
		var dates=existing.stream().map(Meal::date).collect(java.util.stream.Collectors.toSet());
		var today=LocalDate.now(java.time.ZoneId.of("Europe/Zurich"));
		var from=dateStart.isBefore(today) ? today : dateStart;
		boolean missing=false;
		for(var day=from;!day.isAfter(dateEnd) && !day.isAfter(from.plusDays(31));day=day.plusDays(1)) if(!dates.contains(day)) { missing=true; break; }
		if(missing) {
			scraped.ensureMeals(mensaId,dateStart,dateEnd);
			return MealQuality.readable(mensaRepository.findMeals(mensaId,dateStart,dateEnd));
		}
		return existing;
	}

	/** How far ahead getMenuDate looks for the next menu, e.g. from Saturday to Monday. */
	static final int NEXT_MENU_DAYS = 7;

	/**
	 * The day whose menu to show by default: the given day if there are meals for it, otherwise the next
	 * day with meals within a week (on weekends: Monday, once the live import has it), otherwise the latest
	 * earlier day with meals, or the first day with meals.
	 */
	public LocalDate getMenuDate(LocalDate today) {
		SortedSet<LocalDate> dates = mensaRepository.findMealDates();
		if(dates.subSet(today,today.plusDays(NEXT_MENU_DAYS+1)).isEmpty()) {
			for(var venue:mensaRepository.findAllMensas()) scraped.ensureMeals(venue.id(),today,today.plusDays(NEXT_MENU_DAYS));
			dates=mensaRepository.findMealDates();
		}
		if (dates.isEmpty() || dates.contains(today)) {
			return today;
		}
		SortedSet<LocalDate> upcoming = dates.subSet(today, today.plusDays(NEXT_MENU_DAYS + 1));
		if (!upcoming.isEmpty()) {
			return upcoming.first();
		}
		SortedSet<LocalDate> earlier = dates.headSet(today);
		return earlier.isEmpty() ? dates.first() : earlier.last();
	}

	/** First and last day with meals, or null if there are none. */
	public @Nullable LocalDate getFirstMealDate() {
		SortedSet<LocalDate> dates = mensaRepository.findMealDates();
		return dates.isEmpty() ? null : dates.first();
	}

	public @Nullable LocalDate getLastMealDate() {
		SortedSet<LocalDate> dates = mensaRepository.findMealDates();
		return dates.isEmpty() ? null : dates.last();
	}

	public List<Campus> getCampuses() {
		return mensaRepository.findAllCampuses();
	}

	/** Display name of the mensa's campus, falling back to its id. */
	public String getCampusName(Mensa mensa) {
		return mensaRepository.findCampusById(mensa.campusId()).map(Campus::name).orElse(mensa.campusId());
	}

	public @Nullable BigDecimal getAverageRating(String mensaId) {
		return ratingService.getAverage(mensaId);
	}

	public void rateMensa(String mensaId, int stars) {
		ratingService.addRating(getMensa(mensaId).id(), stars);
	}

}
