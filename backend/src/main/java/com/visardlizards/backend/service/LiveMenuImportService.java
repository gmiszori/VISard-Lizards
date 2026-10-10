package com.visardlizards.backend.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.repository.MensaRepository;

/**
 * Loads live ETH menus (current and next week) into the database, on startup and every 6 hours.
 * For each ETH mensa with live meals in a week, that week's meals are replaced; mensas without live meals
 * keep what they had. UZH needs a ZFV API key and is not imported yet.
 * Turn off with app.live-import.enabled=false (tests do).
 */
@Service
public class LiveMenuImportService {

	/** Result of one import run. */
	public record ImportResult(int weeks, int mensas, int meals) {
	}

	private static final Logger log = LoggerFactory.getLogger(LiveMenuImportService.class);

	private final EthMensaClient ethMensaClient;
	private final EthMenuMapper ethMenuMapper;
	private final MensaRepository mensaRepository;
	private final Clock clock;
	private final boolean enabled;

	public LiveMenuImportService(EthMensaClient ethMensaClient, EthMenuMapper ethMenuMapper,
			MensaRepository mensaRepository, Clock clock,
			@Value("${app.live-import.enabled:true}") boolean enabled) {
		this.ethMensaClient = ethMensaClient;
		this.ethMenuMapper = ethMenuMapper;
		this.mensaRepository = mensaRepository;
		this.clock = clock;
		this.enabled = enabled;
	}

	@EventListener(ApplicationReadyEvent.class)
	public void importOnStartup() {
		if (enabled) {
			importEthMenus();
		}
	}

	@Scheduled(cron = "${app.live-import.cron:0 0 */6 * * *}", zone = "Europe/Zurich")
	public void importOnSchedule() {
		if (enabled) {
			importEthMenus();
		}
	}

	/** Imports the current and the next week. A failing week is logged and skipped. */
	public ImportResult importEthMenus() {
		Map<Integer, String> mensaIdsByFacility = new HashMap<>();
		for (Mensa mensa : mensaRepository.findAllMensas()) {
			if (mensa.source() != null && mensa.source().facilityId() != null) {
				mensaIdsByFacility.put(mensa.source().facilityId(), mensa.id());
			}
		}
		LocalDate monday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		int weeks = 0;
		int mensas = 0;
		int meals = 0;
		for (LocalDate weekStart : List.of(monday, monday.plusWeeks(1))) {
			LocalDate weekEnd = weekStart.plusDays(6);
			try {
				List<String> pages = ethMensaClient.fetchWeeklyRotaPages(weekStart, "en");
				List<String> germanPages;
				try {
					germanPages = ethMensaClient.fetchWeeklyRotaPages(weekStart, "de");
				} catch (RuntimeException e) {
					log.warn("German ETH menu fallback for {} unavailable; keeping valid English meals: {}",
							weekStart, e.getMessage());
					germanPages = List.of();
				}
				Map<String, List<Meal>> byMensa = ethMenuMapper.map(pages, germanPages, mensaIdsByFacility, weekStart, weekEnd)
						.stream()
						.collect(Collectors.groupingBy(Meal::mensaId));
				byMensa.forEach((mensaId, mealsOfMensa) ->
						mensaRepository.replaceMeals(mensaId, weekStart, weekEnd, mealsOfMensa));
				weeks++;
				mensas += byMensa.size();
				meals += byMensa.values().stream().mapToInt(List::size).sum();
				log.info("Imported live ETH menus for {} to {}: {} meals of {} mensas", weekStart, weekEnd,
						byMensa.values().stream().mapToInt(List::size).sum(), byMensa.size());
			} catch (RuntimeException e) {
				log.warn("Live ETH menu import for the week of {} failed, keeping existing meals: {}", weekStart,
						e.getMessage());
			}
		}
		return new ImportResult(weeks, mensas, meals);
	}

}
