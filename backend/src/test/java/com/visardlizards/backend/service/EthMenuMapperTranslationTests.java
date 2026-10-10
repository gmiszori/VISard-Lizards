package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.visardlizards.backend.model.domain.Meal;

import tools.jackson.databind.json.JsonMapper;

/**
 * Real Cookpit data of the week of 12 Oct 2026 with broken English translations: Tannenbar names every meal
 * "Chicken Katsu", Clausiusbar has "novalue" as name and description. The German pages have the real menus.
 */
class EthMenuMapperTranslationTests {

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);

	private final EthMenuMapper mapper = new EthMenuMapper(JsonMapper.builder().build());

	private static List<String> page(String name) throws IOException {
		return List.of(new ClassPathResource("eth/" + name).getContentAsString(StandardCharsets.UTF_8));
	}

	private List<Meal> map(String englishPage, int facility, String mensaId, LocalDate date) throws IOException {
		return mapper.map(page(englishPage), page("weekly-rotas-2026-10-12-de.json"), Map.of(facility, mensaId), date,
				date);
	}

	@Test
	void placeholderEnglishNamesFallBackToGerman() throws IOException {
		List<Meal> monday = map("weekly-rotas-2026-10-12-broken-en.json", 11, "tannenbar", MONDAY);
		assertThat(monday).extracting(Meal::title, Meal::dietTag).containsExactly(
				tuple("Piri Piri Chicken Bowl", "meat"),
				tuple("Smoky Tofu Bowl", "vegan"));
		assertThat(monday.get(1).components()).startsWith("Smoky Tofu");
	}

	@Test
	void unclassifiedCheeseBowlIsVegetarian() throws IOException {
		List<Meal> thursday = map("weekly-rotas-2026-10-12-broken-en.json", 11, "tannenbar", MONDAY.plusDays(3));
		assertThat(thursday).extracting(Meal::title, Meal::dietTag).containsExactly(
				tuple("Lemon Chicken Bowl", "meat"),
				tuple("Grilled Cheese Bowl", "vegetarian"));
	}

	@Test
	void novalueFallsBackToGermanNameAndDescription() throws IOException {
		Meal first = map("weekly-rotas-2026-10-12-broken-en.json", 3, "clausiusbar", MONDAY).getFirst();
		assertThat(first.title()).isEqualTo("YANG KUNG");
		// the German description lists "Myanmar Currysauce" twice
		assertThat(first.components()).containsExactly("Truthahn", "Myanmar Currysauce", "Karotten", "Sellerie",
				"Paprika", "Jasminreis");
	}

	@Test
	void correctEnglishNamesAreKept() throws IOException {
		List<Meal> tuesday = map("weekly-rotas-2026-10-12.json", 9, "polyterrasse", MONDAY.plusDays(1));
		assertThat(tuesday).extracting(Meal::title).contains("Venison Stew", "Pad Thai");
	}

	@Test
	void withoutGermanPagesTheEnglishTextIsUsed() throws IOException {
		List<Meal> monday = mapper.map(page("weekly-rotas-2026-10-12-broken-en.json"), Map.of(11, "tannenbar"), MONDAY,
				MONDAY);
		assertThat(monday).extracting(Meal::title).containsOnly("Chicken Katsu");
	}

}
