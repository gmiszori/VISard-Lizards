package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Price;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Maps raw ETH Cookpit weekly rotas (see EthMensaClient) to domain meals.
 * A rota describes, per facility and validity period, the meals of each weekday:
 * day-of-week-array / opening-hour-array / meal-time-array (Lunch, Dinner) / line-array / meal.
 */
@Component
public class EthMenuMapper {

	/** ETH allergen names to the canonical ids used in the rest of the app. */
	private static final Map<String, String> ALLERGENS = Map.ofEntries(
			Map.entry("gluten wheat", "gluten"), Map.entry("milk, lactose", "milk"), Map.entry("soya", "soy"),
			Map.entry("sulfites", "sulphites"), Map.entry("eggs", "eggs"), Map.entry("fish", "fish"),
			Map.entry("crustaceans", "crustaceans"), Map.entry("molluscs", "molluscs"), Map.entry("nuts", "nuts"),
			Map.entry("peanuts", "peanuts"), Map.entry("celery", "celery"), Map.entry("mustard", "mustard"),
			Map.entry("sesame", "sesame"), Map.entry("lupin", "lupin"));

	private final JsonMapper jsonMapper;

	public EthMenuMapper(JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
	}

	/**
	 * Meals between both dates (inclusive) of the facilities in {@code mensaIdsByFacility}.
	 * Meal ids follow the snapshot's format: {mensaId}.{date}.{service}.{index}.
	 */
	public List<Meal> map(List<String> pages, Map<Integer, String> mensaIdsByFacility, LocalDate from, LocalDate to) {
		return map(pages, List.of(), mensaIdsByFacility, from, to);
	}

	/**
	 * Like {@link #map(List, Map, LocalDate, LocalDate)}, with the German pages of the same week as a fallback
	 * for broken English translations: when one English name stands for meals that have different German names
	 * in the same rota (e.g. Tannenbar in October 2026: every meal was "Chicken Katsu" in English), the English
	 * text is a placeholder, and those meals get their German name and description. Meals are matched across
	 * languages by their line-id.
	 */
	public List<Meal> map(List<String> pages, List<String> germanPages, Map<Integer, String> mensaIdsByFacility,
			LocalDate from, LocalDate to) {
		List<JsonNode> rotas = readRotas(pages);
		Map<Long, JsonNode> germanMeals = new HashMap<>();
		for (JsonNode rota : readRotas(germanPages)) {
			forEachMeal(rota, (day, line, meal) -> germanMeals.put(meal.path("line-id").asLong(), meal));
		}
		Map<Long, Set<String>> placeholdersByRota = new HashMap<>();
		List<Meal> meals = new ArrayList<>();
		for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
			for (Map.Entry<Integer, String> facility : mensaIdsByFacility.entrySet()) {
				JsonNode rota = rotaFor(rotas, facility.getKey(), date);
				if (rota != null) {
					Set<String> placeholders = placeholdersByRota.computeIfAbsent(rota.path("weekly-rota-id").asLong(),
							id -> placeholderNames(rota, germanMeals));
					meals.addAll(mealsOfDay(rota, facility.getValue(), date, germanMeals, placeholders));
				}
			}
		}
		return meals;
	}

	private List<JsonNode> readRotas(List<String> pages) {
		List<JsonNode> rotas = new ArrayList<>();
		for (String page : pages) {
			jsonMapper.readTree(page).path("weekly-rota-array").forEach(rotas::add);
		}
		return rotas;
	}

	private interface MealVisitor {
		void visit(JsonNode day, JsonNode line, JsonNode meal);
	}

	private static void forEachMeal(JsonNode rota, MealVisitor visitor) {
		for (JsonNode day : rota.path("day-of-week-array")) {
			for (JsonNode hours : day.path("opening-hour-array")) {
				for (JsonNode mealTime : hours.path("meal-time-array")) {
					for (JsonNode line : mealTime.path("line-array")) {
						JsonNode meal = line.path("meal");
						if (!meal.isMissingNode() && !meal.isNull()) {
							visitor.visit(day, line, meal);
						}
					}
				}
			}
		}
	}

	/** English names in a rota that stand for meals with different German names. */
	private static Set<String> placeholderNames(JsonNode rota, Map<Long, JsonNode> germanMeals) {
		Map<String, Set<String>> germanNamesByEnglishName = new HashMap<>();
		forEachMeal(rota, (day, line, meal) -> {
			JsonNode german = germanMeals.get(meal.path("line-id").asLong());
			if (german != null) {
				germanNamesByEnglishName.computeIfAbsent(text(meal, "name"), name -> new LinkedHashSet<>())
						.add(text(german, "name"));
			}
		});
		Set<String> placeholders = new LinkedHashSet<>();
		germanNamesByEnglishName.forEach((english, germanNames) -> {
			if (germanNames.size() > 1) {
				placeholders.add(english);
			}
		});
		return placeholders;
	}

	/**
	 * A text field with all whitespace (including line breaks) collapsed to single spaces. Cookpit marks
	 * missing translations as "novalue"; those count as empty.
	 */
	private static String text(JsonNode node, String field) {
		String text = node.path(field).asString("").replaceAll("\\s+", " ").trim();
		return text.equalsIgnoreCase("novalue") ? "" : text;
	}

	/** The field from textSource, or from the German meal if textSource has none. */
	private static String text(JsonNode textSource, @Nullable JsonNode german, String field) {
		String text = text(textSource, field);
		return text.isEmpty() && german != null ? text(german, field) : text;
	}

	/** The rota of a facility valid on a date; if several are, the most specific (shortest validity). */
	private static @Nullable JsonNode rotaFor(List<JsonNode> rotas, int facilityId, LocalDate date) {
		return rotas.stream()
				.filter(r -> r.path("facility-id").asInt() == facilityId)
				.filter(r -> !date.isBefore(LocalDate.parse(r.path("valid-from").asString()))
						&& !date.isAfter(LocalDate.parse(r.path("valid-to").asString())))
				.min(Comparator.comparingLong(r -> ChronoUnit.DAYS.between(
						LocalDate.parse(r.path("valid-from").asString()), LocalDate.parse(r.path("valid-to").asString()))))
				.orElse(null);
	}

	private static List<Meal> mealsOfDay(JsonNode rota, String mensaId, LocalDate date, Map<Long, JsonNode> germanMeals,
			Set<String> placeholders) {
		List<Meal> meals = new ArrayList<>();
		Map<String, Integer> indexByService = new HashMap<>();
		for (JsonNode day : rota.path("day-of-week-array")) {
			if (day.path("day-of-week-code").asInt() != date.getDayOfWeek().getValue()) {
				continue;
			}
			for (JsonNode hours : day.path("opening-hour-array")) {
				for (JsonNode mealTime : hours.path("meal-time-array")) {
					String service = mealTime.path("name").asString("").toLowerCase(Locale.ROOT).contains("dinner")
							? "dinner" : "lunch";
					for (JsonNode line : mealTime.path("line-array")) {
						JsonNode meal = line.path("meal");
						if (meal.isMissingNode() || meal.isNull()) {
							continue;
						}
						int index = indexByService.merge(service, 1, Integer::sum) - 1;
						JsonNode german = germanMeals.get(meal.path("line-id").asLong());
						String englishName = text(meal, "name");
						JsonNode textSource = german != null && (englishName.isEmpty() || placeholders.contains(englishName))
								? german : meal;
						meals.add(toMeal(meal, textSource, german, line.path("name").asString(""), mensaId, date, service,
								index));
					}
				}
			}
		}
		return meals;
	}

	/**
	 * textSource provides name and description: the meal itself, or its German version (see map). Fields
	 * missing in textSource are taken from the German version.
	 */
	private static Meal toMeal(JsonNode meal, JsonNode textSource, @Nullable JsonNode german, String line,
			String mensaId, LocalDate date, String service, int index) {
		List<String> components = Arrays.stream(text(textSource, german, "description").split("\\|"))
				.map(String::trim)
				.filter(component -> !component.isEmpty())
				.distinct()
				.toList();
		Set<String> allergens = new LinkedHashSet<>();
		for (JsonNode allergen : meal.path("allergen-array")) {
			String name = allergen.path("desc").asString("").toLowerCase(Locale.ROOT);
			allergens.add(ALLERGENS.getOrDefault(name, name));
		}
		String title = text(textSource, german, "name");
		return new Meal(mensaId + "." + date + "." + service + "." + index, mensaId, date, service, line,
				kind(line, title), title, components, diet(meal, allergens), price(meal),
				List.copyOf(allergens), null, null);
	}

	/** main, buffet, dessert or drink, from the counter and meal name (Cookpit has no field for it). */
	static String kind(String line, String title) {
		String text = (line + " " + title).toLowerCase(Locale.ROOT);
		if (text.contains("dessert")) {
			return "dessert";
		}
		if (text.contains("buffet") || text.contains("100g")) {
			return "buffet";
		}
		if (text.contains("smoothie") || text.contains("drink") || text.contains("coffee")) {
			return "drink";
		}
		return "main";
	}

	/**
	 * vegan, vegetarian, fish or meat from the meal classes. Meals with only other classes (Salad, Pasta, Soup,
	 * Pizza) count as meat if a meat type is listed, as fish if they contain fish, and as vegetarian otherwise.
	 */
	static String diet(JsonNode meal, Set<String> allergens) {
		Set<String> classes = new LinkedHashSet<>();
		for (JsonNode mealClass : meal.path("meal-class-array")) {
			classes.add(mealClass.path("desc").asString("").toLowerCase(Locale.ROOT));
		}
		for (String diet : List.of("vegan", "vegetarian", "fish", "meat")) {
			if (classes.contains(diet)) {
				return diet;
			}
		}
		if (!meal.path("meat-type-array").isEmpty()) {
			return "meat";
		}
		return allergens.contains("fish") ? "fish" : "vegetarian";
	}

	/** Customer groups: 10 students, 11 internal (staff), 13 external, 12 internal & students, 14 all visitors. */
	private static @Nullable Price price(JsonNode meal) {
		BigDecimal student = null;
		BigDecimal staff = null;
		BigDecimal external = null;
		for (JsonNode price : meal.path("meal-price-array")) {
			BigDecimal value = price.path("price").decimalValue();
			if (value.signum() <= 0) {
				continue;
			}
			switch (price.path("customer-group-code").asInt()) {
				case 10 -> student = value;
				case 11 -> staff = value;
				case 12 -> {
					student = value;
					staff = value;
				}
				case 13 -> external = value;
				case 14 -> {
					student = value;
					staff = value;
					external = value;
				}
				default -> {
				}
			}
		}
		return student == null && staff == null && external == null ? null : new Price(student, staff, external);
	}

}
