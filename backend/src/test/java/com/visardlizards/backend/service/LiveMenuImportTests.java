package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.visardlizards.backend.repository.MensaRepository;

/** Imports recorded Cookpit data (week of 12 Oct 2026) into the test database. */
@SpringBootTest
class LiveMenuImportTests {

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);

	@Autowired
	private MensaRepository mensaRepository;

	@Autowired
	private EthMenuMapper ethMenuMapper;

	@AfterEach
	void removeImportedWeek() {
		for (String mensaId : List.of("polyterrasse", "food-and-lab")) {
			mensaRepository.replaceMeals(mensaId, MONDAY, MONDAY.plusDays(6), List.of());
		}
	}

	@Test
	void importsNextWeekForMensasWithLiveMeals() throws IOException {
		EthMensaClient client = mock(EthMensaClient.class);
		when(client.fetchWeeklyRotaPages(eq(MONDAY), any())).thenReturn(EthMenuMapperTests.fixture());
		when(client.fetchWeeklyRotaPages(eq(MONDAY.minusWeeks(1)), any())).thenThrow(new IllegalStateException("offline"));
		Clock saturday = Clock.fixed(ZonedDateTime.of(2026, 10, 17, 12, 0, 0, 0, ZoneId.of("Europe/Zurich")).toInstant(),
				ZoneId.of("Europe/Zurich"));
		// On Saturday 17 Oct the current week is the one of 12 Oct; the next week has no data in the fixture.
		when(client.fetchWeeklyRotaPages(eq(MONDAY.plusWeeks(1)), any())).thenReturn(List.of("{\"weekly-rota-array\":[]}"));

		var result = new LiveMenuImportService(client, ethMenuMapper, mensaRepository, saturday, true).importEthMenus();

		assertThat(result.weeks()).isEqualTo(2);
		assertThat(result.mensas()).isEqualTo(2);
		assertThat(mensaRepository.findMeals("polyterrasse", LocalDate.of(2026, 10, 13), LocalDate.of(2026, 10, 13)))
				.hasSize(12);
		assertThat(mensaRepository.findMeals("archimedes", MONDAY, MONDAY.plusDays(6))).isEmpty();
	}

	@Test
	void failingWeekKeepsExistingMeals() {
		EthMensaClient client = mock(EthMensaClient.class);
		when(client.fetchWeeklyRotaPages(any(), any())).thenThrow(new IllegalStateException("offline"));
		Clock clock = Clock.fixed(ZonedDateTime.of(2026, 10, 6, 12, 0, 0, 0, ZoneId.of("Europe/Zurich")).toInstant(),
				ZoneId.of("Europe/Zurich"));
		int before = mensaRepository.findMeals("polyterrasse", LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 9)).size();

		var result = new LiveMenuImportService(client, ethMenuMapper, mensaRepository, clock, true).importEthMenus();

		assertThat(result.weeks()).isZero();
		assertThat(mensaRepository.findMeals("polyterrasse", LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 9)))
				.hasSize(before)
				.isNotEmpty();
	}

}
