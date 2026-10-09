package com.visardlizards.backend.model.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class MensaTests {

	private static final ServiceHours LUNCH = new ServiceHours("lunch", LocalTime.of(11, 0), LocalTime.of(14, 0));
	/** Monday. */
	private static final LocalDate MONDAY = LocalDate.of(2026, 12, 21);

	@Test
	void serviceHoursFollowTheWeekday() {
		Mensa mensa = mensa(false, List.of());
		assertThat(mensa.serviceHoursOn(MONDAY)).containsExactly(LUNCH);
		assertThat(mensa.serviceHoursOn(MONDAY.plusDays(1))).isEmpty();
	}

	@Test
	void noServiceHoursDuringClosure() {
		Mensa mensa = mensa(false, List.of(new Closure(MONDAY, MONDAY.plusDays(13), "Betriebsferien")));
		assertThat(mensa.serviceHoursOn(MONDAY)).isEmpty();
		assertThat(mensa.serviceHoursOn(MONDAY.plusDays(14))).containsExactly(LUNCH);
	}

	@Test
	void noServiceHoursWhenTemporarilyClosed() {
		assertThat(mensa(true, List.of()).serviceHoursOn(MONDAY)).isEmpty();
	}

	private static Mensa mensa(boolean temporarilyClosed, List<Closure> closures) {
		return new Mensa("test", "Test", "UZH", "zentrum", new Address("Street 1", "8000", "Zürich", null),
				true, temporarilyClosed, Map.of("mon", List.of(LUNCH)), closures);
	}

}
