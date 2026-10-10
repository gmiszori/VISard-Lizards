package com.visardlizards.backend.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.UzhMensaClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Imports live meal offers from UZH and FOOD2050 GraphQL API and saves them into the database.
 */
@Component
public class UzhLiveMealImporter {

    private static final Logger log = LoggerFactory.getLogger(UzhLiveMealImporter.class);

    public record LocationMeta(String mensaId, String service) {}

    public static final Map<String, LocationMeta> UZH_LOCATIONS = Map.ofEntries(
            Map.entry("25588906-4759-4b54-9c0e-bf7b4fd158a4", new LocationMeta("untere-mensa", "lunch")),
            Map.entry("7a05967f-9d99-40ca-9b4b-064a81261644", new LocationMeta("untere-mensa", "dinner")),
            Map.entry("2e02c699-d208-4845-8b3c-519bde6b9574", new LocationMeta("obere-mensa", "lunch")),
            Map.entry("4bd02416-f190-4578-be30-b407fe8711cb", new LocationMeta("lichthof", "lunch")),
            Map.entry("575bd916-b658-4a51-a323-f87d16bfcaa6", new LocationMeta("rami-59", "lunch")),
            Map.entry("6d268500-a1dc-4dd1-bb5f-3a1b0ebf167c", new LocationMeta("platte-14", "lunch")),
            Map.entry("db4c6c53-7d90-4aa5-a809-e3cd086e6513", new LocationMeta("zzm", "lunch")),
            Map.entry("fd30cf8c-11e8-40c7-ac57-7fa6296187d9", new LocationMeta("mensa", "lunch")),
            Map.entry("c62c31ee-77f1-4e13-b9ad-89c1868e8932", new LocationMeta("green-kitchen-lab", "lunch")),
            Map.entry("c00789c1-d3a5-422f-91f3-9b12ca1c9d8c", new LocationMeta("seerose", "lunch")),
            Map.entry("d1d6260e-d9ca-480b-929a-5ebcfe68bc03", new LocationMeta("seerose", "dinner")),
            Map.entry("50f4eedd-5c16-4677-b8a5-f9dab84b0b2e", new LocationMeta("mensa-binzmuhle", "lunch")),
            Map.entry("fbb986b1-36be-4fc7-b5be-4de5046a32b1", new LocationMeta("cityport", "lunch")),
            Map.entry("edc3b2cb-004c-41fc-84d3-cd9ade4dff74", new LocationMeta("tierspital", "lunch")),
            Map.entry("7d9d696f-3c4e-4a2e-9b66-469d5d47eeea", new LocationMeta("botanischer-garten", "lunch"))
    );

    private final UzhMensaClient uzhClient;
    private final MealEntityRepository mealRepository;
    private final JsonMapper jsonMapper;

    public UzhLiveMealImporter(UzhMensaClient uzhClient, MealEntityRepository mealRepository, JsonMapper jsonMapper) {
        this.uzhClient = uzhClient;
        this.mealRepository = mealRepository;
        this.jsonMapper = jsonMapper;
    }

    @Transactional
    public int importTodayUzhMeals(LocalDate date) {
        Objects.requireNonNull(date, "date must not be null");
        List<MealEntity> toSave = new ArrayList<>();

        for (Map.Entry<String, LocationMeta> entry : UZH_LOCATIONS.entrySet()) {
            String locationId = entry.getKey();
            LocationMeta meta = entry.getValue();

            try {
                String json = uzhClient.fetchTodayOffers(locationId);
                if (json == null || json.isBlank()) {
                    continue;
                }
                List<MealEntity> parsed = parseLocationOffers(json, meta, date);
                toSave.addAll(parsed);
            } catch (Exception e) {
                log.warn("Failed to import UZH meals for location {}: {}", locationId, e.getMessage());
            }
        }

        mealRepository.saveAll(toSave);
        log.info("Live UZH meal import for date {} saved {} meals", date, toSave.size());
        return toSave.size();
    }

    public List<MealEntity> parseLocationOffers(String json, LocationMeta meta, LocalDate date) {
        List<MealEntity> meals = new ArrayList<>();
        try {
            JsonNode root = jsonMapper.readTree(json);
            JsonNode location = root.path("data").path("location");
            if (location.isMissingNode() || location.isNull()) {
                return meals;
            }

            JsonNode kitchens = location.path("kitchens");
            if (kitchens.isMissingNode() || !kitchens.isArray()) {
                return meals;
            }

            int index = 1;
            for (JsonNode kitchen : kitchens) {
                String kitchenSlug = kitchen.path("slug").asText("");
                JsonNode items = kitchen.path("todayOffer").path("digitalMenuItems");
                if (items.isMissingNode() || !items.isArray()) {
                    continue;
                }

                for (JsonNode item : items) {
                    String line = item.path("displayName").asText(kitchenSlug);
                    JsonNode recipe = item.path("recipe");
                    if (recipe.isMissingNode() || recipe.isNull()) {
                        continue;
                    }

                    String title = recipe.path("title").asText("");
                    if (title.isBlank()) {
                        title = line;
                    }

                    BigDecimal priceStudent = null;
                    BigDecimal priceStaff = null;
                    BigDecimal priceExternal = null;

                    JsonNode prices = recipe.path("prices");
                    if (prices.isArray()) {
                        for (JsonNode p : prices) {
                            double amount = p.path("amount").asDouble(0.0);
                            String cat = p.path("category").path("title").asText("").toLowerCase();
                            if (cat.contains("stud")) {
                                priceStudent = BigDecimal.valueOf(amount);
                            } else if (cat.contains("mitarb") || cat.contains("staff")) {
                                priceStaff = BigDecimal.valueOf(amount);
                            } else if (cat.contains("ext") || cat.contains("gast") || cat.contains("guest")) {
                                priceExternal = BigDecimal.valueOf(amount);
                            }
                        }
                    }

                    List<String> allergens = new ArrayList<>();
                    JsonNode allergensNode = recipe.path("allergensList");
                    if (allergensNode.isArray()) {
                        for (JsonNode a : allergensNode) {
                            String name = a.asText("").trim();
                            if (!name.isBlank()) {
                                allergens.add(name);
                            }
                        }
                    }

                    String dietTag = inferDietTag(title, line);
                    List<String> components = List.of(title);

                    String mealId = String.format("uzh-%s-%s-%s-%d", meta.mensaId(), date, meta.service(), index++);
                    meals.add(new MealEntity(
                            mealId,
                            meta.mensaId(),
                            date,
                            meta.service(),
                            line,
                            meta.service(),
                            title,
                            dietTag,
                            priceStudent,
                            priceStaff,
                            priceExternal,
                            null,
                            null,
                            components,
                            allergens
                    ));
                }
            }
        } catch (Exception e) {
            log.error("Error parsing UZH location offer JSON: {}", e.getMessage());
        }
        return meals;
    }

    private static String inferDietTag(String title, String line) {
        String text = (title + " " + line).toLowerCase();
        if (text.contains("vegan")) {
            return "vegan";
        } else if (text.contains("vegi") || text.contains("vegetarisch") || text.contains("vegetarian")) {
            return "vegetarian";
        } else if (text.contains("fleisch") || text.contains("rind") || text.contains("schwein")
                || text.contains("poulet") || text.contains("chicken") || text.contains("fisch")) {
            return "meat";
        }
        return "unknown";
    }
}
