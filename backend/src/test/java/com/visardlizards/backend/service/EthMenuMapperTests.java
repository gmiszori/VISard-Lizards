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

/** Uses real Cookpit data of the week of 12 Oct 2026 (Polyterrasse, food&lab, Polysnack). */
class EthMenuMapperTests {

	private static final LocalDate TUESDAY = LocalDate.of(2026, 10, 13);
	private static final Map<Integer, String> FACILITIES = Map.of(9, "polyterrasse", 7, "food-and-lab", 10, "polysnack");

	private final EthMenuMapper mapper = new EthMenuMapper(JsonMapper.builder().build());

	static List<String> fixture() throws IOException {
		return List.of(new ClassPathResource("eth/weekly-rotas-2026-10-12.json").getContentAsString(StandardCharsets.UTF_8));
	}

	@Test
	void mapsAllMealsOfADay() throws IOException {
		List<Meal> meals = polyterrasse(TUESDAY);
		assertThat(meals).hasSize(12);
		assertThat(meals).filteredOn(meal -> meal.service().equals("lunch")).hasSize(8);
		assertThat(meals).filteredOn(meal -> meal.service().equals("dinner")).hasSize(4);
	}

	@Test
	void mapsMealDetails() throws IOException {
		Meal venison = polyterrasse(TUESDAY).getFirst();
		assertThat(venison.id()).isEqualTo("polyterrasse.2026-10-13.lunch.0");
		assertThat(venison.title()).isEqualTo("Venison Stew");
		assertThat(venison.line()).isEqualTo("LOCAL");
		assertThat(venison.kind()).isEqualTo("main");
		assertThat(venison.dietTag()).isEqualTo("meat");
		assertThat(venison.components()).startsWith("Chanterelles", "Dried figs");
		assertThat(venison.allergens()).containsExactly("gluten", "celery", "sulphites");
		assertThat(venison.price().student()).isEqualByComparingTo("12.5");
		assertThat(venison.price().staff()).isEqualByComparingTo("14.5");
		assertThat(venison.price().external()).isEqualByComparingTo("18.5");
	}

	@Test
	void mapsDietsKindsAndDinnerIds() throws IOException {
		List<Meal> meals = polyterrasse(TUESDAY);
		assertThat(meals).extracting(Meal::title, Meal::dietTag).contains(
				tuple("Shiitake Dim Sum Ramen", "vegan"),
				tuple("Pad Thai", "vegetarian"));
		assertThat(meals).extracting(Meal::title, Meal::kind).contains(
				tuple("Hot & Cold Buffet", "buffet"),
				tuple("Dessert of the day", "dessert"),
				tuple("Smoothie - every Tuesday", "drink"));
		assertThat(meals).filteredOn(meal -> meal.service().equals("dinner"))
				.extracting(Meal::id)
				.containsExactly("polyterrasse.2026-10-13.dinner.0", "polyterrasse.2026-10-13.dinner.1",
						"polyterrasse.2026-10-13.dinner.2", "polyterrasse.2026-10-13.dinner.3");
	}

	@Test
	void facilitiesWithoutRotaGetNoMeals() throws IOException {
		List<Meal> week = mapper.map(fixture(), FACILITIES, LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 18));
		assertThat(week).noneMatch(meal -> meal.mensaId().equals("polysnack"));
		assertThat(week).anyMatch(meal -> meal.mensaId().equals("food-and-lab"));
		assertThat(week).noneMatch(meal -> meal.date().getDayOfWeek().getValue() >= 6);
	}

	private List<Meal> polyterrasse(LocalDate date) throws IOException {
		return mapper.map(fixture(), Map.of(9, "polyterrasse"), date, date);
	}

}
