package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.visardlizards.backend.model.domain.Address;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.ServiceHours;

class CrowdServiceTests {

	private static final ZoneId ZURICH = ZoneId.of("Europe/Zurich");
	private static final ServiceHours LUNCH = new ServiceHours("lunch", LocalTime.of(11, 0), LocalTime.of(14, 0));

	/** Tuesday 2026-10-06 12:00 in Zurich. */
	private final MutableClock clock = new MutableClock(ZonedDateTime.of(2026, 10, 6, 12, 0, 0, 0, ZURICH).toInstant());
	private final CrowdService crowdService = new CrowdService(new InMemoryCrowdReportRepository(), clock);

	@Test
	void liveReportsAreFromTheLast30MinutesNewestFirst() {
		crowdService.addReport("polyterrasse", 2);
		clock.advance(Duration.ofMinutes(20));
		crowdService.addReport("polyterrasse", 4);
		clock.advance(Duration.ofMinutes(15));

		assertThat(crowdService.getLiveReports("polyterrasse"))
				.extracting(report -> report.level())
				.containsExactly(4);
	}

	@Test
	void histogramNeedsEnoughReports() {
		for (int i = 0; i < CrowdService.MIN_SAMPLE_SIZE - 1; i++) {
			crowdService.addReport("polyterrasse", 3);
		}
		var histogram = crowdService.getHistogram(POLYTERRASSE);
		assertThat(histogram.sufficient()).isFalse();
		assertThat(histogram.sampleSize()).isEqualTo(CrowdService.MIN_SAMPLE_SIZE - 1);
		assertThat(histogram.byWeekday()).isNull();
	}

	@Test
	void histogramAveragesPerWeekdayIn15MinuteSlots() {
		for (int i = 0; i < CrowdService.MIN_SAMPLE_SIZE / 2; i++) {
			crowdService.addReport("polyterrasse", 5); // 100
			crowdService.addReport("polyterrasse", 3); // 50
		}
		var histogram = crowdService.getHistogram(POLYTERRASSE);
		assertThat(histogram.sufficient()).isTrue();
		assertThat(histogram.byWeekday()).containsOnlyKeys("mon", "tue", "wed", "thu", "fri", "sat", "sun");
		var tuesday = histogram.byWeekday().get("tue");
		// Reports were made on Tuesday at 12:00; the opening hours 11:00-14:00 give the other slots.
		assertThat(tuesday).containsEntry("12:00", 75);
		assertThat(tuesday).containsEntry("11:00", null).containsEntry("12:15", null).containsEntry("13:45", null);
		assertThat(tuesday).doesNotContainKey("14:00").hasSize(12);
		assertThat(tuesday.keySet()).first().isEqualTo("11:00");
		assertThat(histogram.byWeekday().get("mon")).containsEntry("12:00", null);
		assertThat(histogram.byWeekday().get("sat")).isEmpty();
	}

	@Test
	void reportsOutsideOpeningHoursGetTheirOwnSlot() {
		clock.advance(Duration.ofMinutes(3 * 60 + 7)); // Tuesday 15:07
		for (int i = 0; i < CrowdService.MIN_SAMPLE_SIZE; i++) {
			crowdService.addReport("polyterrasse", 2); // 25
		}
		var tuesday = crowdService.getHistogram(POLYTERRASSE).byWeekday().get("tue");
		assertThat(tuesday).containsEntry("15:00", 25);
		assertThat(tuesday.keySet()).last().isEqualTo("15:00");
	}

	/** Lunch 11:00-14:00 on weekdays. */
	private static final Mensa POLYTERRASSE = new Mensa("polyterrasse", "Mensa Polyterrasse", "ETH", "zentrum",
			new Address("Leonhardstrasse 34", "8092", "Zürich", null), true, false,
			Map.of("mon", List.of(LUNCH), "tue", List.of(LUNCH), "wed", List.of(LUNCH), "thu", List.of(LUNCH),
					"fri", List.of(LUNCH)),
			List.of(), null);

	@Test
	void rejectsLevelsOutsideOneToFive() {
		assertThatThrownBy(() -> crowdService.addReport("polyterrasse", 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> crowdService.addReport("polyterrasse", 6)).isInstanceOf(IllegalArgumentException.class);
	}

	private static final class MutableClock extends Clock {

		private Instant now;

		MutableClock(Instant now) {
			this.now = now;
		}

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZURICH;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			throw new UnsupportedOperationException();
		}

	}

}
