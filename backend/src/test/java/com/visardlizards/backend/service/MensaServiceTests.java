package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.visardlizards.backend.repository.JsonMensaRepository;

import tools.jackson.databind.json.JsonMapper;

/** Runs against the real data snapshot (meals from 2026-09-28 to 2026-10-09). */
class MensaServiceTests {

	private final MensaService mensaService =
			new MensaService(new JsonMensaRepository(JsonMapper.builder().build()), new RatingService());

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
