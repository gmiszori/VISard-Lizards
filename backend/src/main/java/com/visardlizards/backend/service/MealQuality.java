package com.visardlizards.backend.service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Price;

/** Keeps known upstream translation placeholders out of public menus, including older stored rows. */
final class MealQuality {

    private record TitleKey(String mensaId, LocalDate date, String service, String title,
            List<String> components, Price price) { }

    private MealQuality() { }

    static List<Meal> readable(List<Meal> meals) {
        Map<TitleKey, Set<String>> dietsByTitle = new HashMap<>();
        for (Meal meal : meals) {
            dietsByTitle.computeIfAbsent(key(meal), ignored -> new HashSet<>()).add(meal.dietTag());
        }
        return meals.stream()
                .filter(meal -> !meal.title().isBlank() && !meal.title().equalsIgnoreCase("novalue"))
                .filter(meal -> dietsByTitle.get(key(meal)).size() == 1)
                .toList();
    }

    private static TitleKey key(Meal meal) {
        return new TitleKey(meal.mensaId(), meal.date(), meal.service(),
                meal.title().trim().toLowerCase(java.util.Locale.ROOT), meal.components(), meal.price());
    }
}
