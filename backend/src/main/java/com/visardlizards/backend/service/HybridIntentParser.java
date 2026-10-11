package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Clock;
import java.time.LocalDate;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import com.visardlizards.backend.model.dto.SearchCriteria;
import com.visardlizards.backend.repository.HybridMealRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** One structured LLM call translates the whole request; no domain-specific keyword parser. */
@Service
public class HybridIntentParser {
    private static final String SYSTEM_PROMPT = """
            You are a universal intent-to-query translator. Convert arbitrary natural language into exactly one JSON object matching the supplied JSON Schema. Do not write prose, markdown, or extra keys. Use the domain schema and currently allowed values below; never invent database fields or values.

            Hard constraints are binary and inviolable: a result MUST satisfy them. Translate explicit mathematical bounds (<=, >=, <, >) to the corresponding gte/lte/gt/lt operator on the exact numeric price field. Translate strict equality on categories, identifiers and service to their exact stored values. Translate allergen exclusions into excludeAllergens. A dietary restriction such as vegan is strict equality on dietTag; do not infer it from a dish title. The request context selects which price column applies. Device coordinates and an active mensaId are context only; their presence NEVER means that the user wants a local-only result set. For a query that only names food, a diet, an ingredient, or a price, set isLocationScoped=false and leave hardFilters.mensaId null. Set isLocationScoped=true only when the query explicitly says 'here', 'this place', 'this canteen', 'this mensa', or 'current menu', and an active mensaId is supplied. A named venue requested by the user belongs in hardFilters.mensaId and does not use isLocationScoped. If only an active campusId is provided, resolve explicit deictic references to that campus via hardFilters.campusId and leave isLocationScoped=false. If neither is provided, leave location filters null. Do not turn a mere preference into a hard filter.

            Soft preferences specify ordering, not eligibility. 'Cheaper' and 'low price' mean PRICE_ASC; 'more expensive' means PRICE_DESC; 'nearby' means DISTANCE_ASC. These do not impose a price or distance ceiling. Use RELEVANCE when no explicit ordering is requested or when semantic relevance is primary.

            Semantic intent contains descriptions that relational operators cannot evaluate: ingredients that are not a formal categorical field, sensory qualities, themes, cuisines, or subjective profiles. Distill these into semanticQuery. For example, 'fish', 'pork', or 'warm spicy comfort food' belongs in semanticQuery unless the user explicitly requests a formal dietTag restriction. Voice input may contain speech-recognition homophones or near-homophones; interpret it in this food-menu context and correct obvious errors before mapping the query. For example, 'children' can mean 'chicken' when used as a requested dish, and '10 friends' can mean '10 francs' when paired with a price bound such as 'under' or 'at most'; map that amount to lte on the active price column. Do not make that currency correction when the surrounding request does not indicate a price. Preserve the user's likely meaning, do not broaden a specific ingredient into a related but different ingredient or dish, and do not invent a hard constraint when the transcript is uncertain. Similarity ranks candidates and never removes borderline matches. For a purely operational browse/list request without descriptive intent, semanticQuery must be null.

            All nullable object properties must be present as null when unused. Use only values from the domain schema. Interpret the query wording before using any location context; context alone is not permission to narrow results.

            Database domain:
            meal.id: String identifier; meal.mensaId: String venue reference; meal.date: LocalDate (server context); meal.title, meal.line: String descriptions; meal.components: List<String> descriptions; meal.allergens: List<String> exact stored allergen labels; meal.dietTag, meal.kind, meal.service: String categorical fields; meal.priceStudent, meal.priceStaff, meal.priceExternal: BigDecimal(precision=6, scale=2) CHF numeric fields with allowed bounds gte, lte, gt, lt; mensa.campusId: String parent campus reference; mensa.latitude and mensa.longitude: Double coordinates for distance ordering.
            Current allowed dietTag values: %s
            Current allowed kind values: %s
            Current allowed service values: %s
            Current allowed mensaId values: %s
            Current allowed campusId values: %s
            Current venue names by mensaId: %s
            Current exact allergen labels: %s
            Current Zurich date for relative dates: %s. Represent an explicit meal date as ISO YYYY-MM-DD in hardFilters.date; otherwise null.
            Active price column: %s
            Active mensaId in context: %s
            Active campusId in context: %s
            App language context: %s. Interpret queries in either English or German/Swiss German, but retain the exact database values required by the JSON schema. Any natural-language wording returned to the user should use the selected app language.
            """;

    private final RestClient client;
    private final JsonMapper mapper;
    private final HybridMealRepository repository;
    private final String apiKey;
    private final String model;
    private final Clock clock;

    public record RealtimePrompt(String instructions, Map<String, Object> criteriaSchema) { }

    public HybridIntentParser(JsonMapper mapper, HybridMealRepository repository, Clock clock,
            @Value("${openai.api-key:}") String apiKey,
            @Value("${openai.model:gpt-4.1-mini}") String model) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.client = RestClient.builder().requestFactory(factory).build();
        this.mapper = mapper;
        this.repository = repository;
        this.clock = clock;
        this.apiKey = apiKey;
        this.model = model;
    }

    public SearchCriteria parse(String query, String activeMensaId, String activeCampusId, String priceColumn) {
        return parse(query, activeMensaId, activeCampusId, priceColumn, "en");
    }

    public SearchCriteria parse(String query, String activeMensaId, String activeCampusId, String priceColumn,
            String appLanguage) {
        return parse(query, activeMensaId, activeCampusId, priceColumn, appLanguage, null);
    }

    /** {@code today} overrides the server date, so a simulated app day resolves "today" and "tomorrow". */
    public SearchCriteria parse(String query, String activeMensaId, String activeCampusId, String priceColumn,
            String appLanguage, LocalDate today) {
        if (query == null || query.isBlank()) return new SearchCriteria(null, false, null, null);
        if (apiKey == null || apiKey.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI intent parser is not configured");
        RealtimePrompt prompt = realtimePrompt(activeMensaId, activeCampusId, priceColumn, appLanguage, today);
        Map<String, Object> body = Map.of("model", model, "store", false,
                "instructions", prompt.instructions(), "input", query,
                "text", Map.of("format", Map.of("type", "json_schema", "name", "meal_search_criteria",
                        "strict", true, "schema", prompt.criteriaSchema())));
        String response = client.post().uri("https://api.openai.com/v1/responses")
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + apiKey)
                .body(body).retrieve().body(String.class);
        JsonNode root = mapper.readTree(response);
        if (!"completed".equals(root.path("status").asText()))
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Intent parser did not complete");
        for (JsonNode output : root.path("output")) for (JsonNode content : output.path("content")) {
            if ("output_text".equals(content.path("type").asText())) {
                SearchCriteria criteria = mapper.readValue(content.path("text").asText(), SearchCriteria.class);
                // Models can still mark a query location-scoped even when this page has no active venue.
                // Fall back to the available campus context (already applied by the repository), or to
                // the normal search scope when the user has not supplied a location.
                return normalizeLocationScope(criteria, activeMensaId, query,
                        activeMensaId == null ? null : repository.mensaNames().get(activeMensaId));
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Intent parser returned no structured output");
    }

    /** Builds the same exact dynamic domain prompt and SearchCriteria schema for Realtime function calls. */
    public RealtimePrompt realtimePrompt(String activeMensaId, String activeCampusId, String priceColumn) {
        return realtimePrompt(activeMensaId, activeCampusId, priceColumn, "en");
    }

    public RealtimePrompt realtimePrompt(String activeMensaId, String activeCampusId, String priceColumn,
            String appLanguage) {
        return realtimePrompt(activeMensaId, activeCampusId, priceColumn, appLanguage, null);
    }

    public RealtimePrompt realtimePrompt(String activeMensaId, String activeCampusId, String priceColumn,
            String appLanguage, LocalDate today) {
        List<String> diets = repository.values("dietTag");
        List<String> kinds = repository.values("kind");
        List<String> services = repository.values("service");
        List<String> mensas = repository.mensaIds();
        List<String> campuses = repository.campusIds();
        List<String> allergens = repository.allergenValues();
        Map<String, String> venueNames = repository.mensaNames();
        String instructions = SYSTEM_PROMPT.formatted(diets, kinds, services, mensas, campuses,
                venueNames, allergens, today != null ? today : LocalDate.now(clock), priceColumn,
                activeMensaId == null ? "none" : activeMensaId,
                activeCampusId == null ? "none" : activeCampusId,
                "de".equalsIgnoreCase(appLanguage) ? "German" : "English");
        return new RealtimePrompt(instructions, schema(diets, kinds, services, mensas, campuses, allergens));
    }

    /** Enforces the location context invariant for criteria parsed by the Realtime function tool. */
    public SearchCriteria normalizeRealtimeCriteria(SearchCriteria criteria, String activeMensaId) {
        return normalizeLocationScope(criteria, activeMensaId);
    }

    static SearchCriteria normalizeLocationScope(SearchCriteria criteria, String activeMensaId) {
        if (criteria.isLocationScoped() && (activeMensaId == null || activeMensaId.isBlank()))
            return new SearchCriteria(criteria.semanticQuery(), false, criteria.hardFilters(), criteria.sortBy());
        return criteria;
    }

    static SearchCriteria normalizeLocationScope(SearchCriteria criteria, String activeMensaId,
            String query, String activeMensaName) {
        boolean hasActiveMensa = activeMensaId != null && !activeMensaId.isBlank();
        boolean explicitlyHere = refersToCurrentPlace(query);
        boolean explicitlyNamesActiveMensa = hasActiveMensa
                && (containsPhrase(query, activeMensaId) || containsPhrase(query, activeMensaName));
        SearchCriteria.HardFilters filters = criteria.hardFilters();
        if (hasActiveMensa && !explicitlyHere && !explicitlyNamesActiveMensa
                && activeMensaId.equals(filters.mensaId())) {
            filters = new SearchCriteria.HardFilters(filters.id(), filters.date(), null, filters.campusId(),
                    filters.dietTag(), filters.kind(), filters.service(), filters.priceStudent(),
                    filters.priceStaff(), filters.priceExternal(), filters.excludeAllergens());
        }
        return new SearchCriteria(criteria.semanticQuery(), hasActiveMensa && explicitlyHere,
                filters, criteria.sortBy());
    }

    private static boolean refersToCurrentPlace(String query) {
        String value = normalizedPhrase(query);
        return Pattern.compile("(?:^| )(?:here|right here|this place|this canteen|this mensa|this cafeteria|this restaurant|at my location|where i am|current menu|current mensa|hier|hier vor ort|diese mensa|diese kantine|dieser ort|aktuelles menue|aktuelle mensa)(?:$| )")
                .matcher(value).find();
    }

    private static boolean containsPhrase(String text, String phrase) {
        String normalizedText = normalizedPhrase(text);
        String normalized = normalizedPhrase(phrase);
        return !normalized.isBlank() && (" " + normalizedText + " ").contains(" " + normalized + " ");
    }

    private static String normalizedPhrase(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private static Map<String, Object> schema(List<String> diets, List<String> kinds, List<String> services,
            List<String> mensas, List<String> campuses, List<String> allergens) {
        Map<String, Object> hard = object(Map.ofEntries(
                Map.entry("id", Map.of("type", List.of("string", "null"))),
                Map.entry("date", Map.of("type", List.of("string", "null"))),
                Map.entry("mensaId", nullableEnum(mensas)), Map.entry("campusId", nullableEnum(campuses)),
                Map.entry("dietTag", nullableEnum(diets)), Map.entry("kind", nullableEnum(kinds)),
                Map.entry("service", nullableEnum(services)), Map.entry("priceStudent", nullableBounds()),
                Map.entry("priceStaff", nullableBounds()), Map.entry("priceExternal", nullableBounds()),
                Map.entry("excludeAllergens", Map.of("type", "array", "items", allergens.isEmpty()
                        ? Map.of("type", "string") : Map.of("type", "string", "enum", allergens)))));
        return object(Map.of("semanticQuery", Map.of("type", List.of("string", "null")),
                "isLocationScoped", Map.of("type", "boolean"),
                "hardFilters", hard,
                "sortBy", Map.of("type", "string", "enum", List.of("RELEVANCE", "PRICE_ASC", "PRICE_DESC", "DISTANCE_ASC"))));
    }

    private static Map<String, Object> nullableBounds() {
        var bounds = object(Map.of("gte", Map.of("type", List.of("number", "null")),
                "lte", Map.of("type", List.of("number", "null")),
                "gt", Map.of("type", List.of("number", "null")),
                "lt", Map.of("type", List.of("number", "null"))));
        return Map.of("anyOf", List.of(bounds, Map.of("type", "null")));
    }

    private static Map<String, Object> nullableEnum(List<String> values) {
        // JSON Schema needs a literal null in the allowed values.
        List<Object> allowed = new ArrayList<>(values);
        allowed.add(null);
        return Map.of("type", List.of("string", "null"), "enum", allowed);
    }

    private static Map<String, Object> object(Map<String, Object> properties) {
        return Map.of("type", "object", "properties", properties,
                "required", List.copyOf(properties.keySet()), "additionalProperties", false);
    }
}
