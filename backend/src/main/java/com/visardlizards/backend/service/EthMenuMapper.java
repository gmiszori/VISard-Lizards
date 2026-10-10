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

	/** German text fills missing English translations; all other fields stay from the English response. */
	public List<Meal> map(List<String> pages, List<String> germanPages,
			Map<Integer, String> mensaIdsByFacility, LocalDate from, LocalDate to) {
		List<JsonNode> rotas = readRotas(pages);
		List<JsonNode> germanRotas = readRotas(germanPages);
		List<Meal> meals = new ArrayList<>();
		for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
			for (Map.Entry<Integer, String> facility : mensaIdsByFacility.entrySet()) {
				JsonNode rota = rotaFor(rotas, facility.getKey(), date);
				if (rota != null) {
					meals.addAll(mealsOfDay(rota, rotaFor(germanRotas, facility.getKey(), date), facility.getValue(), date));
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

	private static List<Meal> mealsOfDay(JsonNode rota, @Nullable JsonNode germanRota, String mensaId, LocalDate date) {
		List<Meal> meals = new ArrayList<>();
		Map<Integer, JsonNode> germanMeals = germanMealsOfDay(germanRota, date.getDayOfWeek().getValue());
		Set<String> placeholders = placeholderNames(rota, germanRota);
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
						Meal mapped = toMeal(meal, germanMeals.get(meal.path("line-id").asInt()),
								placeholders.contains(cleanText(meal, "name")),
								line.path("name").asString(""), mensaId, date, service, index);
						if (mapped != null) { meals.add(mapped); }
					}
				}
			}
		}
		return meals;
	}

	private static Map<Integer, JsonNode> germanMealsOfDay(@Nullable JsonNode germanRota, int weekday) {
		Map<Integer, JsonNode> germanMeals = new HashMap<>();
		if (germanRota != null) {
			for (JsonNode day : germanRota.path("day-of-week-array")) {
				if (day.path("day-of-week-code").asInt() != weekday) { continue; }
				for (JsonNode hours : day.path("opening-hour-array")) {
					for (JsonNode time : hours.path("meal-time-array")) {
						for (JsonNode line : time.path("line-array")) {
							JsonNode meal = line.path("meal");
							int lineId = meal.path("line-id").asInt();
							if (lineId > 0) { germanMeals.put(lineId, meal); }
						}
					}
				}
			}
		}
		return germanMeals;
	}

	/** Preserve the collaborator's detection of one English placeholder used for different German dishes. */
	private static Set<String> placeholderNames(JsonNode rota, @Nullable JsonNode germanRota) {
		Map<String, Set<String>> names = new HashMap<>();
		for (JsonNode day : rota.path("day-of-week-array")) {
			Map<Integer, JsonNode> germanMeals = germanMealsOfDay(germanRota, day.path("day-of-week-code").asInt());
			for (JsonNode hours : day.path("opening-hour-array")) {
				for (JsonNode mealTime : hours.path("meal-time-array")) {
					for (JsonNode line : mealTime.path("line-array")) {
						JsonNode meal = line.path("meal");
						JsonNode german = germanMeals.get(meal.path("line-id").asInt());
						if (german != null && usableText(cleanText(german, "name"))) {
							names.computeIfAbsent(cleanText(meal, "name"), key -> new LinkedHashSet<>())
									.add(cleanText(german, "name"));
						}
					}
				}
			}
		}
		return names.entrySet().stream().filter(entry -> entry.getValue().size() > 1)
				.map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet());
	}

	private static @Nullable Meal toMeal(JsonNode meal, @Nullable JsonNode germanMeal,
			boolean preferGerman, String line, String mensaId, LocalDate date, String service, int index) {
		JsonNode textSource = preferGerman && germanMeal != null ? germanMeal : meal;
		String title = translatedText(textSource, germanMeal, "name");
		// Do not invent a dish name or publish Cookpit's translation placeholder.
		// The source index was already allocated, so later meal ids do not shift.
		if (title.isEmpty()) { return null; }
		List<String> components = Arrays.stream(translatedText(textSource, germanMeal, "description").split("\\|"))
				.map(String::trim)
				.filter(EthMenuMapper::usableText)
				.distinct()
				.toList();
		Set<String> allergens = new LinkedHashSet<>();
		for (JsonNode allergen : meal.path("allergen-array")) {
			String name = allergen.path("desc").asString("").toLowerCase(Locale.ROOT);
			allergens.add(ALLERGENS.getOrDefault(name, name));
		}
		return new Meal(mensaId + "." + date + "." + service + "." + index, mensaId, date, service, line,
				kind(line, title), title, components, diet(meal, allergens), price(meal),
				List.copyOf(allergens), null, null);
	}

	private static String translatedText(JsonNode meal, @Nullable JsonNode germanMeal, String field) {
		String english = cleanText(meal, field);
		if (usableText(english)) { return english; }
		String german = germanMeal == null ? "" : cleanText(germanMeal, field);
		return usableText(german) ? german : "";
	}

	private static String cleanText(JsonNode node, String field) {
		return node.path(field).asString("").replaceAll("\\s+", " ").trim();
	}

	private static boolean usableText(String text) {
		return !text.isBlank() && !text.equalsIgnoreCase("novalue");
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
