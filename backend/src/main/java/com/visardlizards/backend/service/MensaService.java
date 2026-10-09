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

	public MensaService(MensaRepository mensaRepository, RatingService ratingService) {
		this.mensaRepository = mensaRepository;
		this.ratingService = ratingService;
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
		return mensaRepository.findMeals(getMensa(mensaId).id(), dateStart, dateEnd);
	}

	/**
	 * The day whose menu to show by default: the given day if there is data for it, otherwise the
	 * latest earlier day with data (e.g. Friday on weekends), or the first day with data.
	 * Same rule as MENU_DATE in frontend/src/data/canteens.ts.
	 */
	public LocalDate getMenuDate(LocalDate today) {
		SortedSet<LocalDate> dates = mensaRepository.findMealDates();
		if (dates.isEmpty() || dates.contains(today)) {
			return today;
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
