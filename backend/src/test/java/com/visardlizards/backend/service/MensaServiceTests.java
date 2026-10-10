package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Runs against the imported data snapshot (meals from 2026-09-28 to 2026-10-09). */
@SpringBootTest
class MensaServiceTests {

	@Autowired
	private MensaService mensaService;

	@Test
	void menuDateIsTodayWhenThereIsData() {
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 6))).isEqualTo(LocalDate.of(2026, 10, 6));
	}

	@Test
	void menuDateIsTheNextDayWithMeals() {
		// Sunday inside the range: Monday's menu, not last Friday's
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 4))).isEqualTo(LocalDate.of(2026, 10, 5));
		// Saturday inside the range
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 3))).isEqualTo(LocalDate.of(2026, 10, 5));
	}

	@Test
	void menuDateFallsBackToLatestEarlierDayWithoutUpcomingMeals() {
		// Saturday after the last day with data (the test database has no live menus)
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 10))).isEqualTo(LocalDate.of(2026, 10, 9));
	}

	@Test
	void menuDateBeforeAllDataIsTheFirstDay() {
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 9, 1))).isEqualTo(LocalDate.of(2026, 9, 28));
	}

	@Test
	void dataRange() {
		assertThat(mensaService.getFirstMealDate()).isEqualTo(LocalDate.of(2026, 9, 28));
		assertThat(mensaService.getLastMealDate()).isEqualTo(LocalDate.of(2026, 10, 9));
	}

}
