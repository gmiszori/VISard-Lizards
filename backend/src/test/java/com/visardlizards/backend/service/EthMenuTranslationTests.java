package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class EthMenuTranslationTests {
    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);
    private final JsonMapper json = JsonMapper.builder().build();
    private final EthMenuMapper mapper = new EthMenuMapper(json);

    @Test
    void missingEnglishNameAndDescriptionUseMatchingGermanMealNotPosition() {
        String english = page(3, MONDAY, List.of(meal(78588, " NoValue ", "novalue", 9.9)));
        String german = page(3, MONDAY, List.of(
                meal(99999, "Unrelated dish", "Do not use", 99),
                meal(78588, "GERMAN DISH", "Gemüse | Reis", 99)));

        var meals = mapper.map(List.of(english), List.of(german), Map.of(3, "clausiusbar"), MONDAY, MONDAY);

        assertThat(meals).hasSize(1);
        assertThat(meals.getFirst().title()).isEqualTo("GERMAN DISH");
        assertThat(meals.getFirst().components()).containsExactly("Gemüse", "Reis");
        assertThat(meals.getFirst().price().student()).isEqualByComparingTo("9.9");
        assertThat(meals.getFirst().allergens()).containsExactly("gluten");
        assertThat(meals.getFirst().id()).isEqualTo("clausiusbar.2026-10-12.lunch.0");
    }

    @Test
    void validEnglishFieldsStayEnglishEvenWithGermanFallback() {
        var meals = mapper.map(List.of(page(3, MONDAY, List.of(meal(1, "English dish", "Rice", 9.9)))),
                List.of(page(3, MONDAY, List.of(meal(1, "Deutsches Gericht", "Reis", 99)))),
                Map.of(3, "clausiusbar"), MONDAY, MONDAY);
        assertThat(meals.getFirst().title()).isEqualTo("English dish");
        assertThat(meals.getFirst().components()).containsExactly("Rice");
    }

    @Test
    void descriptionCanFallBackIndependentlyOfTitle() {
        var meals = mapper.map(List.of(page(3, MONDAY, List.of(meal(1, "English dish", "novalue", 9.9)))),
                List.of(page(3, MONDAY, List.of(meal(1, "Deutsches Gericht", "Reis", 99)))),
                Map.of(3, "clausiusbar"), MONDAY, MONDAY);
        assertThat(meals.getFirst().title()).isEqualTo("English dish");
        assertThat(meals.getFirst().components()).containsExactly("Reis");
    }

    @Test
    void doesNotBorrowATitleFromAnotherFacilityDayOrWeek() {
        String english = page(3, MONDAY, List.of(meal(1, "novalue", "novalue", 9.9)));
        var meals = mapper.map(List.of(english), List.of(
                page(4, MONDAY, List.of(meal(1, "Other facility", "Other", 99))),
                page(3, MONDAY.plusWeeks(1), List.of(meal(1, "Other week", "Other", 99))),
                page(3, MONDAY.plusDays(1), List.of(meal(1, "Other day", "Other", 99)))),
                Map.of(3, "clausiusbar"), MONDAY, MONDAY);
        assertThat(meals).isEmpty();
    }

    @Test
    void unresolvedPlaceholdersAreOmittedWithoutShiftingOtherMealIds() {
        var meals = mapper.map(List.of(page(3, MONDAY, List.of(
                meal(1, "novalue", "novalue", 9.9), meal(2, "Real dish", "NOVALUE", 9.9)))),
                List.of(page(3, MONDAY, List.of(meal(1, "novalue", "novalue", 99)))),
                Map.of(3, "clausiusbar"), MONDAY, MONDAY);
        assertThat(meals).hasSize(1);
        assertThat(meals.getFirst().title()).isEqualTo("Real dish");
        assertThat(meals.getFirst().components()).isEmpty();
        assertThat(meals.getFirst().id()).isEqualTo("clausiusbar.2026-10-12.lunch.1");
    }

    private Map<String, Object> meal(int id, String name, String description, double price) {
        return Map.of("line-id", id, "name", name, "description", description,
                "meal-price-array", List.of(Map.of("price", price, "customer-group-code", 10)),
                "allergen-array", List.of(Map.of("desc", "gluten wheat")));
    }

    String page(int facility, LocalDate day, List<Map<String, Object>> meals) {
        var lines = meals.stream().map(meal -> Map.of("name", "WOK STREET", "meal", meal)).toList();
        return json.writeValueAsString(Map.of("weekly-rota-array", List.of(Map.of(
                "facility-id", facility, "valid-from", day.with(java.time.DayOfWeek.MONDAY).toString(),
                "valid-to", day.with(java.time.DayOfWeek.SUNDAY).toString(),
                "day-of-week-array", List.of(Map.of("day-of-week-code", day.getDayOfWeek().getValue(),
                        "opening-hour-array", List.of(Map.of("meal-time-array",
                                List.of(Map.of("name", "Lunch", "line-array", lines))))))))));
    }
}
