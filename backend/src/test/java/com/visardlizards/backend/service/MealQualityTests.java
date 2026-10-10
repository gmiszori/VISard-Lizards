package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Price;
import java.math.BigDecimal;

class MealQualityTests {

    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);

    private static Meal meal(String id, String mensa, String title, String diet) {
        return new Meal(id, mensa, MONDAY, "lunch", "line", "main", title, List.of(), diet,
                null, List.of(), null, null);
    }

    @Test
    void hidesStoredPlaceholdersAndContradictoryTitles() {
        Meal placeholder = meal("clausiusbar.0", "clausiusbar", "novalue", "meat");
        Meal chicken = meal("tannenbar.0", "tannenbar", "Chicken Katsu", "meat");
        Meal tofu = meal("tannenbar.1", "tannenbar", "Chicken Katsu", "vegan");
        Meal good = meal("polyterrasse.0", "polyterrasse", "Pad Thai", "vegetarian");

        assertThat(MealQuality.readable(List.of(placeholder, chicken, tofu, good))).containsExactly(good);
    }

    @Test
    void keepsDistinctOfferingsWithTheSameTitleAndDiet() {
        Meal first = meal("first", "polyterrasse", "Daily Special", "vegetarian");
        Meal second = meal("second", "polyterrasse", "Daily Special", "vegetarian");

        assertThat(MealQuality.readable(List.of(first, second))).containsExactly(first, second);
    }

    @Test
    void keepsDifferentVersionsOfTheSameNamedDish() {
        Meal meat = meal("meat", "polyterrasse", "Pad Thai", "meat");
        Meal vegetarian = new Meal("veg", "polyterrasse", MONDAY, "lunch", "line", "main", "Pad Thai",
                List.of("Tofu"), "vegetarian", null, List.of(), null, null);

        assertThat(MealQuality.readable(List.of(meat, vegetarian))).containsExactly(meat, vegetarian);
    }

    @Test
    void keepsSameNamedOfferingsAtDifferentPrices() {
        Meal cheap = new Meal("cheap", "food-and-lab", MONDAY, "lunch", "East", "main", "Foodlab Burger",
                List.of("Brioche"), "vegetarian", new Price(new BigDecimal("10.90"), null, null), List.of(), null, null);
        Meal expensive = new Meal("expensive", "food-and-lab", MONDAY, "lunch", "West", "main", "Foodlab Burger",
                List.of("Brioche"), "meat", new Price(new BigDecimal("11.90"), null, null), List.of(), null, null);

        assertThat(MealQuality.readable(List.of(cheap, expensive))).containsExactly(cheap, expensive);
    }
}
