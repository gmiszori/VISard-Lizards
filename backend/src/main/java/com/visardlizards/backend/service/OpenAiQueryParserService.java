package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.visardlizards.backend.model.dto.StructuredMealQuery;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Interacts with OpenAI to extract structured database query constraints and preferences
 * from natural language user prompts (e.g. "i want to eat fish for a low price in a close place for at most 15chf").
 * Includes resilient heuristic fallback if the OpenAI API is unconfigured or unreachable.
 */
@Service
public class OpenAiQueryParserService {

	private static final Logger log = LoggerFactory.getLogger(OpenAiQueryParserService.class);

	private static final String SYSTEM_INSTRUCTIONS = """
			You are an expert culinary query extractor for Swiss university canteens (ETH & UZH Zurich).
			Your task is to extract structured database search criteria from the user's natural language request.
			Return a strict JSON object with:
			- maxPrice: maximum price in CHF as a number (e.g. 15.0 if user specifies 'at most 15chf', 'under 14chf', etc.), or null if none.
			- minPrice: minimum price in CHF as a number, or null if none.
			- diet: exact diet tag ('fish', 'meat', 'vegetarian', 'vegan'), or null if no diet specified. If the user mentions fish or seafood, diet MUST be 'fish'.
			- searchTerms: an array of relevant dish and ingredient keywords and synonyms in English and German.
			  CRITICAL: If the user searches for fish, expand this to include common fish and seafood types:
			  ['fish', 'fisch', 'salmon', 'lachs', 'trout', 'forelle', 'tuna', 'thunfisch', 'cod', 'kabeljau', 'seelachs', 'dorade', 'pike', 'hecht', 'zander', 'seafood', 'meeresfrüchte'].
			  If pasta, include ['pasta', 'spaghetti', 'penne', 'noodles', 'nudeln'].
			- excludeAllergens: array of canonical allergen IDs to avoid (e.g. 'gluten', 'milk', 'soy', 'peanuts', 'nuts', 'eggs', 'fish', 'celery').
			- campus: target campus ID if mentioned ('zentrum', 'hoenggerberg', 'irchel'), or null.
			- prioritizePrice: boolean, true if user asks for low price, cheap, cheapest, budget, affordable, or günstig.
			- prioritizeDistance: boolean, true if user asks for a close place, nearby, near me, short walk, or nah.
			- prioritizeRating: boolean, true if user asks for top rated, best, delicious, or tasty.
			- prioritizeEco: boolean, true if user asks for eco-friendly, green, sustainable, or low CO2.
			- explanation: brief concise summary of the extracted criteria.
			""";

	private final RestClient client;
	private final JsonMapper mapper;
	private final String apiKey;
	private final String model;

	public OpenAiQueryParserService(
			JsonMapper mapper,
			@Value("${openai.api-key:${OPENAI_API_KEY:}}") String apiKey,
			@Value("${openai.model:${OPENAI_MODEL:gpt-4.1-mini}}") String model) {
		HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
		factory.setReadTimeout(Duration.ofSeconds(12));
		this.client = RestClient.builder().requestFactory(factory).build();
		this.mapper = mapper;
		this.apiKey = apiKey;
		this.model = model;
	}

	public StructuredMealQuery parse(String userQuery) {
		if (userQuery == null || userQuery.isBlank()) {
			return new StructuredMealQuery("", null, null, null, List.of(), List.of(), null, false, false, false, false, "Empty query");
		}
		String trimmed = userQuery.trim();

		if (apiKey != null && !apiKey.isBlank() && apiKey.chars().noneMatch(Character::isISOControl)) {
			try {
				StructuredMealQuery openAiResult = callOpenAi(trimmed);
				if (openAiResult != null) {
					return openAiResult;
				}
			} catch (Exception e) {
				log.warn("OpenAI query parsing failed or timed out: {}. Using heuristic extraction.", e.getMessage());
			}
		}

		return parseHeuristically(trimmed);
	}

	private @Nullable StructuredMealQuery callOpenAi(String userQuery) {
		Map<String, Object> properties = Map.ofEntries(
				Map.entry("maxPrice", Map.of("type", List.of("number", "null"))),
				Map.entry("minPrice", Map.of("type", List.of("number", "null"))),
				Map.entry("diet", Map.of("type", List.of("string", "null"))),
				Map.entry("searchTerms", Map.of("type", "array", "items", Map.of("type", "string"))),
				Map.entry("excludeAllergens", Map.of("type", "array", "items", Map.of("type", "string"))),
				Map.entry("campus", Map.of("type", List.of("string", "null"))),
				Map.entry("prioritizePrice", Map.of("type", "boolean")),
				Map.entry("prioritizeDistance", Map.of("type", "boolean")),
				Map.entry("prioritizeRating", Map.of("type", "boolean")),
				Map.entry("prioritizeEco", Map.of("type", "boolean")),
				Map.entry("explanation", Map.of("type", "string")));

		Map<String, Object> schema = Map.of(
				"type", "object",
				"properties", properties,
				"required", List.of(
						"maxPrice", "minPrice", "diet", "searchTerms", "excludeAllergens",
						"campus", "prioritizePrice", "prioritizeDistance", "prioritizeRating", "prioritizeEco", "explanation"),
				"additionalProperties", false);

		Map<String, Object> body = Map.of(
				"model", model,
				"store", false,
				"instructions", SYSTEM_INSTRUCTIONS,
				"input", "User natural language query: " + userQuery,
				"text", Map.of("format", Map.of(
						"type", "json_schema",
						"name", "structured_meal_query",
						"strict", true,
						"schema", schema)));

		String responseJson = client.post().uri("https://api.openai.com/v1/responses")
				.contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + apiKey)
				.body(body).retrieve().body(String.class);

		JsonNode root = responseJson == null ? null : mapper.readTree(responseJson);
		if (root != null && "completed".equals(root.path("status").asText())) {
			for (JsonNode output : root.path("output")) {
				for (JsonNode content : output.path("content")) {
					if ("output_text".equals(content.path("type").asText())) {
						JsonNode data = mapper.readTree(content.path("text").asText());
						Double maxPrice = data.hasNonNull("maxPrice") ? data.path("maxPrice").asDouble() : null;
						Double minPrice = data.hasNonNull("minPrice") ? data.path("minPrice").asDouble() : null;
						String diet = data.hasNonNull("diet") ? data.path("diet").asText().trim().toLowerCase(Locale.ROOT) : null;
						String campus = data.hasNonNull("campus") ? data.path("campus").asText().trim().toLowerCase(Locale.ROOT) : null;
						boolean prioritizePrice = data.path("prioritizePrice").asBoolean(false);
						boolean prioritizeDistance = data.path("prioritizeDistance").asBoolean(false);
						boolean prioritizeRating = data.path("prioritizeRating").asBoolean(false);
						boolean prioritizeEco = data.path("prioritizeEco").asBoolean(false);
						String explanation = data.path("explanation").asText("Extracted via OpenAI");

						List<String> searchTerms = new ArrayList<>();
						if (data.path("searchTerms").isArray()) {
							for (JsonNode term : data.path("searchTerms")) {
								if (term.isTextual() && !term.asText().isBlank()) {
									searchTerms.add(term.asText().trim().toLowerCase(Locale.ROOT));
								}
							}
						}

						List<String> allergens = new ArrayList<>();
						if (data.path("excludeAllergens").isArray()) {
							for (JsonNode a : data.path("excludeAllergens")) {
								if (a.isTextual() && !a.asText().isBlank()) {
									allergens.add(a.asText().trim().toLowerCase(Locale.ROOT));
								}
							}
						}

						return new StructuredMealQuery(
								userQuery, maxPrice, minPrice, diet, searchTerms, allergens,
								campus, prioritizePrice, prioritizeDistance, prioritizeRating, prioritizeEco, explanation);
					}
				}
			}
		}
		return null;
	}

	/**
	 * High-precision local heuristic parser used when OpenAI is offline or as fallback.
	 * Identifies price caps (e.g. "at most 15chf", "under 14 chf"), fish & food varieties,
	 * price preferences, and distance preferences.
	 */
	public StructuredMealQuery parseHeuristically(String query) {
		String lower = query.toLowerCase(Locale.ROOT);

		// 1. Max price detection (e.g. "at most 15chf", "under 14chf", "below 15 chf", "< 15 chf", "for at most 15 chf")
		Double maxPrice = null;
		Matcher maxPriceMatcher = Pattern.compile(
				"(?:at most|under|max(?:imum)?|below|up to|less than|<|<=|für maximal|unter|bis zu)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:chf|fr|.-)?",
				Pattern.CASE_INSENSITIVE).matcher(lower);
		if (maxPriceMatcher.find()) {
			try {
				maxPrice = Double.parseDouble(maxPriceMatcher.group(1));
			} catch (NumberFormatException ignored) {}
		} else {
			Matcher standalonePrice = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:chf|fr)\\b", Pattern.CASE_INSENSITIVE).matcher(lower);
			if (standalonePrice.find()) {
				try {
					maxPrice = Double.parseDouble(standalonePrice.group(1));
				} catch (NumberFormatException ignored) {}
			}
		}

		// 2. Diet and food search terms
		String diet = null;
		Set<String> searchTerms = new LinkedHashSet<>();

		boolean mentionsFish = lower.matches(".*\\b(fish|fisch|salmon|lachs|trout|forelle|tuna|thunfisch|cod|kabeljau|dorsch|seelachs|dorade|seafood|meeresfr.*|shrimp|crevette|garnele|pike|hecht|zander)\\b.*");
		boolean mentionsVegan = lower.matches(".*\\b(vegan|rein pflanzlich)\\b.*");
		boolean mentionsVegetarian = lower.matches(".*\\b(vegetarian|vegetarisch|veggie)\\b.*");
		boolean mentionsMeat = lower.matches(".*\\b(meat|fleisch|chicken|poulet|beef|rind|pork|schwein)\\b.*");

		if (mentionsFish) {
			diet = "fish";
			searchTerms.addAll(List.of(
					"fish", "fisch", "salmon", "lachs", "trout", "forelle",
					"tuna", "thunfisch", "cod", "kabeljau", "seelachs", "dorade",
					"pike", "hecht", "zander", "seafood", "meeresfrüchte", "crevette", "garnele"));
		} else if (mentionsVegan) {
			diet = "vegan";
		} else if (mentionsVegetarian) {
			diet = "vegetarian";
		} else if (mentionsMeat) {
			diet = "meat";
		}

		// Check other food items
		if (lower.contains("curry")) searchTerms.add("curry");
		if (lower.contains("pasta") || lower.contains("nudel")) searchTerms.addAll(List.of("pasta", "spaghetti", "penne", "nudeln"));
		if (lower.contains("burger")) searchTerms.add("burger");
		if (lower.contains("pizza")) searchTerms.add("pizza");
		if (lower.contains("soup") || lower.contains("suppe")) searchTerms.addAll(List.of("soup", "suppe"));
		if (lower.contains("salad") || lower.contains("salat")) searchTerms.addAll(List.of("salad", "salat"));

		// 3. Allergens to exclude
		List<String> excludeAllergens = new ArrayList<>();
		if (lower.matches(".*\\b(no gluten|glutenfrei|gluten-free|without gluten)\\b.*")) excludeAllergens.add("gluten");
		if (lower.matches(".*\\b(no milk|laktosefrei|lactose-free|without milk|milchfrei)\\b.*")) excludeAllergens.add("milk");
		if (lower.matches(".*\\b(no soy|sojafrei|without soy)\\b.*")) excludeAllergens.add("soy");
		if (lower.matches(".*\\b(no nuts|nussfrei|without nuts)\\b.*")) excludeAllergens.add("nuts");

		// 4. Campus
		String campus = null;
		if (lower.contains("zentrum")) campus = "zentrum";
		else if (lower.contains("hönggerberg") || lower.contains("hoenggerberg")) campus = "hoenggerberg";
		else if (lower.contains("irchel")) campus = "irchel";

		// 5. Ranking Priorities
		boolean prioritizePrice = lower.matches(".*\\b(low price|low-price|lower price|cheap|cheaper|cheapest|budget|affordable|günstig|billig|preiswert|spar)\\b.*");
		boolean prioritizeDistance = lower.matches(".*\\b(close|close place|close by|closer|nearby|near me|nearest|short distance|walking distance|nah|in der nähe|am nächsten)\\b.*");
		boolean prioritizeRating = lower.matches(".*\\b(rating|high rating|best|top|popular|beliebt|lecker|tasty|delicious)\\b.*");
		boolean prioritizeEco = lower.matches(".*\\b(eco|green|sustainable|climate|nachhaltig|klima)\\b.*");

		StringBuilder exp = new StringBuilder("Extracted structured query");
		if (diet != null) exp.append(": diet=").append(diet);
		if (maxPrice != null) exp.append(", maxPrice=").append(maxPrice).append(" CHF");
		if (prioritizePrice) exp.append(", prioritizePrice=true");
		if (prioritizeDistance) exp.append(", prioritizeDistance=true");

		return new StructuredMealQuery(
				query, maxPrice, null, diet, new ArrayList<>(searchTerms),
				excludeAllergens, campus, prioritizePrice, prioritizeDistance,
				prioritizeRating, prioritizeEco, exp.toString());
	}
}
