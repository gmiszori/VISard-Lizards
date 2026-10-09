package com.visardlizards.backend.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Service;

import com.visardlizards.backend.model.domain.CrowdHistogram;
import com.visardlizards.backend.model.domain.CrowdReport;

/** Crowd reports, kept in memory until there is a database. */
@Service
public class CrowdService {

	/** Reports newer than this count as "live". */
	static final Duration LIVE_WINDOW = Duration.ofMinutes(30);
	/** Below this many reports the histogram is not meaningful. */
	static final int MIN_SAMPLE_SIZE = 20;

	private static final ZoneId ZONE = ZoneId.of("Europe/Zurich");

	private final Clock clock;
	private final Map<String, List<CrowdReport>> reportsByMensaId = new ConcurrentHashMap<>();

	public CrowdService(Clock clock) {
		this.clock = clock;
	}

	/** Stores a report stamped with the server time. */
	public CrowdReport addReport(String mensaId, int level) {
		if (level < 1 || level > 5) {
			throw new IllegalArgumentException("level must be between 1 and 5, was " + level);
		}
		CrowdReport report = new CrowdReport(mensaId, level, clock.instant());
		reportsByMensaId.computeIfAbsent(mensaId, id -> new CopyOnWriteArrayList<>()).add(report);
		return report;
	}

	/** Reports of the last 30 minutes, newest first. */
	public List<CrowdReport> getLiveReports(String mensaId) {
		Instant since = clock.instant().minus(LIVE_WINDOW);
		return reports(mensaId).stream()
				.filter(report -> report.timestamp().isAfter(since))
				.sorted(Comparator.comparing(CrowdReport::timestamp).reversed())
				.toList();
	}

	/** Average level per weekday and hour, scaled to 0-100 (level 1 = 0, level 5 = 100). */
	public CrowdHistogram getHistogram(String mensaId) {
		List<CrowdReport> reports = reports(mensaId);
		if (reports.size() < MIN_SAMPLE_SIZE) {
			return new CrowdHistogram(mensaId, false, reports.size(), null);
		}
		int[][] sum = new int[7][24];
		int[][] count = new int[7][24];
		for (CrowdReport report : reports) {
			ZonedDateTime time = report.timestamp().atZone(ZONE);
			int day = time.getDayOfWeek().ordinal();
			sum[day][time.getHour()] += (report.level() - 1) * 25;
			count[day][time.getHour()]++;
		}
		Map<String, List<Integer>> byWeekday = new LinkedHashMap<>();
		for (DayOfWeek day : DayOfWeek.values()) {
			List<Integer> hours = new ArrayList<>(24);
			for (int hour = 0; hour < 24; hour++) {
				int n = count[day.ordinal()][hour];
				hours.add(n == 0 ? 0 : Math.round((float) sum[day.ordinal()][hour] / n));
			}
			byWeekday.put(day.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT), hours);
		}
		return new CrowdHistogram(mensaId, true, reports.size(), byWeekday);
	}

	private List<CrowdReport> reports(String mensaId) {
		return reportsByMensaId.getOrDefault(mensaId, List.of());
	}

}
