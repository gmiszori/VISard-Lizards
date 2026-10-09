package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

class CrowdServiceTests {

	private static final ZoneId ZURICH = ZoneId.of("Europe/Zurich");

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
		var histogram = crowdService.getHistogram("polyterrasse");
		assertThat(histogram.sufficient()).isFalse();
		assertThat(histogram.sampleSize()).isEqualTo(CrowdService.MIN_SAMPLE_SIZE - 1);
		assertThat(histogram.byWeekday()).isNull();
	}

	@Test
	void histogramAveragesPerWeekdayAndHour() {
		for (int i = 0; i < CrowdService.MIN_SAMPLE_SIZE / 2; i++) {
			crowdService.addReport("polyterrasse", 5); // 100
			crowdService.addReport("polyterrasse", 3); // 50
		}
		var histogram = crowdService.getHistogram("polyterrasse");
		assertThat(histogram.sufficient()).isTrue();
		assertThat(histogram.byWeekday()).containsOnlyKeys("mon", "tue", "wed", "thu", "fri", "sat", "sun");
		assertThat(histogram.byWeekday().get("tue").get(12)).isEqualTo(75);
		assertThat(histogram.byWeekday().get("tue").get(13)).isZero();
		assertThat(histogram.byWeekday().get("mon").get(12)).isZero();
	}

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
