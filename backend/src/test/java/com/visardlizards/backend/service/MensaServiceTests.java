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
	void menuDateFallsBackToLatestEarlierDay() {
		// Saturday after the last day with data
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 10))).isEqualTo(LocalDate.of(2026, 10, 9));
		// Sunday inside the range
		assertThat(mensaService.getMenuDate(LocalDate.of(2026, 10, 4))).isEqualTo(LocalDate.of(2026, 10, 2));
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
