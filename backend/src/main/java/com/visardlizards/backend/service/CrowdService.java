package com.visardlizards.backend.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.model.domain.CrowdHistogram;
import com.visardlizards.backend.model.domain.CrowdReport;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.ServiceHours;
import com.visardlizards.backend.repository.CrowdReportRepository;

/** Crowd reports ("how full is it?") and the popular-times histogram built from them. */
@Service
public class CrowdService {

	/** Reports newer than this count as "live". */
	static final Duration LIVE_WINDOW = Duration.ofMinutes(30);
	/** Below this many reports the histogram is not meaningful. */
	static final int MIN_SAMPLE_SIZE = 10;

	private static final ZoneId ZONE = ZoneId.of("Europe/Zurich");

	private final CrowdReportRepository crowdReportRepository;
	private final Clock clock;

	public CrowdService(CrowdReportRepository crowdReportRepository, Clock clock) {
		this.crowdReportRepository = crowdReportRepository;
		this.clock = clock;
	}

	/** Stores a report stamped with the server time. */
	public CrowdReport addReport(String mensaId, int level) {
		if (level < 1 || level > 5) {
			throw new IllegalArgumentException("level must be between 1 and 5, was " + level);
		}
		CrowdReport report = new CrowdReport(mensaId, level, clock.instant());
		crowdReportRepository.save(report);
		return report;
	}

	/** Reports of the last 30 minutes, newest first. */
	public List<CrowdReport> getLiveReports(String mensaId) {
		return crowdReportRepository.findByMensaIdSince(mensaId, clock.instant().minus(LIVE_WINDOW));
	}

	/**
	 * Average reported occupancy per weekday in 15-minute slots, scaled to 0-100 (level 1 = 0, level 5 = 100),
	 * null for slots without reports.
	 */
	public CrowdHistogram getHistogram(Mensa mensa) {
		List<CrowdReport> reports = crowdReportRepository.findByMensaId(mensa.id());
		if (reports.size() < MIN_SAMPLE_SIZE) {
			return new CrowdHistogram(mensa.id(), false, reports.size(), null);
		}
		// Per weekday: slot start minute -> {sum of occupancy, number of reports}. Slots inside the opening
		// hours exist even without reports (value null), so the chart shows the whole service window.
		List<Map<Integer, int[]>> slotsByDay = new ArrayList<>();
		for (DayOfWeek day : DayOfWeek.values()) {
			Map<Integer, int[]> slots = new TreeMap<>();
			if (!mensa.temporarilyClosed()) {
				for (ServiceHours window : mensa.openingHours().getOrDefault(weekdayKey(day), List.of())) {
					int close = window.close().getHour() * 60 + window.close().getMinute();
					for (int minute = slotStart(window.open().getHour() * 60 + window.open().getMinute());
							minute < close; minute += CrowdHistogram.INTERVAL_MINUTES) {
						slots.put(minute, new int[2]);
					}
				}
			}
			slotsByDay.add(slots);
		}
		for (CrowdReport report : reports) {
			ZonedDateTime time = report.timestamp().atZone(ZONE);
			int[] slot = slotsByDay.get(time.getDayOfWeek().ordinal())
					.computeIfAbsent(slotStart(time.getHour() * 60 + time.getMinute()), minute -> new int[2]);
			slot[0] += (report.level() - 1) * 25;
			slot[1]++;
		}
		Map<String, Map<String, @Nullable Integer>> byWeekday = new LinkedHashMap<>();
		for (DayOfWeek day : DayOfWeek.values()) {
			Map<String, @Nullable Integer> slots = new LinkedHashMap<>();
			slotsByDay.get(day.ordinal()).forEach((minute, sumAndCount) -> slots.put(
					String.format(Locale.ROOT, "%02d:%02d", minute / 60, minute % 60),
					sumAndCount[1] == 0 ? null : Math.round((float) sumAndCount[0] / sumAndCount[1])));
			byWeekday.put(weekdayKey(day), slots);
		}
		return new CrowdHistogram(mensa.id(), true, reports.size(), byWeekday);
	}

	private static int slotStart(int minuteOfDay) {
		return minuteOfDay - minuteOfDay % CrowdHistogram.INTERVAL_MINUTES;
	}

	private static String weekdayKey(DayOfWeek day) {
		return day.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT);
	}

}
