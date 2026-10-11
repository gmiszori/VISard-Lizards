package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
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
import com.visardlizards.backend.model.domain.Meal;

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
		for (String mensaId : List.of("polyterrasse", "food-and-lab", "clausiusbar")) {
			mensaRepository.replaceMeals(mensaId, MONDAY, MONDAY.plusDays(6), List.of());
		}
	}

	@Test
	void refreshRepairsAnAlreadyStoredClausiusbarPlaceholder() {
		String id = "clausiusbar.2026-10-12.lunch.0";
		mensaRepository.replaceMeals("clausiusbar", MONDAY, MONDAY.plusDays(6), List.of(
				new Meal(id, "clausiusbar", MONDAY, "lunch", "WOK STREET", "main", "novalue",
						List.of("novalue"), "vegetarian", null, List.of(), null, null)));
		EthMensaClient client = mock(EthMensaClient.class);
		when(client.fetchWeeklyRotaPages(eq(MONDAY), eq("en"))).thenReturn(List.of(clausiusRota("novalue", "novalue")));
		when(client.fetchWeeklyRotaPages(eq(MONDAY), eq("de"))).thenReturn(List.of(clausiusRota("Deutsches Gericht", "Reis")));
		when(client.fetchWeeklyRotaPages(eq(MONDAY.plusWeeks(1)), any()))
				.thenReturn(List.of("{\"weekly-rota-array\":[]}"));
		Clock clock = Clock.fixed(MONDAY.atStartOfDay(ZoneId.of("Europe/Zurich")).toInstant(), ZoneId.of("Europe/Zurich"));

		var result = new LiveMenuImportService(client, ethMenuMapper, mensaRepository, clock, true).importEthMenus();

		assertThat(result.meals()).isEqualTo(1);
		Meal stored = mensaRepository.findMealById(id).orElseThrow();
		assertThat(stored.title()).isEqualTo("Deutsches Gericht");
		assertThat(stored.components()).containsExactly("Reis");
	}

	@Test
	void unavailableGermanFeedDoesNotPreventValidEnglishImport() {
		EthMensaClient client = mock(EthMensaClient.class);
		when(client.fetchWeeklyRotaPages(eq(MONDAY), eq("en")))
				.thenReturn(List.of(clausiusRota("English dish", "Rice")));
		when(client.fetchWeeklyRotaPages(any(), eq("de"))).thenThrow(new IllegalStateException("offline"));
		when(client.fetchWeeklyRotaPages(eq(MONDAY.plusWeeks(1)), eq("en")))
				.thenReturn(List.of("{\"weekly-rota-array\":[]}"));
		Clock clock = Clock.fixed(MONDAY.atStartOfDay(ZoneId.of("Europe/Zurich")).toInstant(), ZoneId.of("Europe/Zurich"));

		var result = new LiveMenuImportService(client, ethMenuMapper, mensaRepository, clock, true).importEthMenus();

		assertThat(result.meals()).isEqualTo(1);
		assertThat(mensaRepository.findMeals("clausiusbar", MONDAY, MONDAY)).extracting(Meal::title)
				.containsExactly("English dish");
	}

	private static String clausiusRota(String name, String description) {
		return """
				{"weekly-rota-array":[{"facility-id":3,"valid-from":"2026-10-12","valid-to":"2026-10-18",
				"day-of-week-array":[{"day-of-week-code":1,"opening-hour-array":[{"meal-time-array":[{
				"name":"Lunch","line-array":[{"name":"WOK STREET","meal":{
				"line-id":78588,"name":"%s","description":"%s"}}]}]}]}]}]}
				""".formatted(name, description);
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

	@Test
	void oneMensaWriteFailureDoesNotStopOtherMensas() {
		EthMensaClient client = mock(EthMensaClient.class);
		EthMenuMapper mapper = mock(EthMenuMapper.class);
		MensaRepository repository = mock(MensaRepository.class);
		when(repository.findAllMensas()).thenReturn(List.of());
		when(client.fetchWeeklyRotaPages(any(), any())).thenReturn(List.of("{\"weekly-rota-array\":[]}"));
		Meal broken = new Meal("broken.2026-10-12.lunch.1", "broken", MONDAY, "lunch", "Main", "main",
				"Broken", List.of(), "unknown", null, List.of(), null, null);
		Meal good = new Meal("good.2026-10-12.lunch.1", "good", MONDAY, "lunch", "Main", "main",
				"Good", List.of(), "unknown", null, List.of(), null, null);
		when(mapper.map(any(), any(), any(), eq(MONDAY), any())).thenReturn(List.of(broken, good));
		when(mapper.map(any(), any(), any(), eq(MONDAY.plusWeeks(1)), any())).thenReturn(List.of());
		doThrow(new IllegalStateException("database write failed"))
				.when(repository).replaceMeals(eq("broken"), any(), any(), any());
		Clock clock = Clock.fixed(MONDAY.atStartOfDay(ZoneId.of("Europe/Zurich")).toInstant(), ZoneId.of("Europe/Zurich"));

		var result = new LiveMenuImportService(client, mapper, repository, clock, true).importEthMenus();

		assertThat(result.weeks()).isEqualTo(2);
		assertThat(result.mensas()).isEqualTo(1);
		assertThat(result.meals()).isEqualTo(1);
		verify(repository).replaceMeals(eq("good"), eq(MONDAY), eq(MONDAY.plusDays(6)), eq(List.of(good)));
	}

}
