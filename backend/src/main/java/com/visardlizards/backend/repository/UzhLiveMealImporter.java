package com.visardlizards.backend.repository;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.UzhMensaClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Imports live meal offers from UZH and FOOD2050 for UZH campuses directly into the database.
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

    public static final Map<String, String> FOOD2050_WEEKLY_OUTLETS = Map.of(
            "botanischer-garten", "https://app.food2050.ch/de/zfv/universitat-zurich,botanischer-garten/botanischer-garten/mittagsverpflegung/menu/weekly",
            "mensa-binzmuhle", "https://app.food2050.ch/de/zfv/universitat-zurich,campus-oerlikon/mensa-binzmuhle/mittagsverpflegung/menu/weekly",
            "cityport", "https://app.food2050.ch/de/zfv/universitat-zurich,cityport/cityport/mittagsverpflegung/menu/weekly",
            "tierspital", "https://app.food2050.ch/de/zfv/universitat-zurich,tierspital-1/tierspital/mittagsverpflegung/menu/weekly",
            "the-yard", "https://app.food2050.ch/de/zfv/universitat-zurich,campus-irchel,ks-oerlikon/the-yard/mittagsverpflegung/menu/weekly",
            "bim11", "https://app.food2050.ch/de/zfv/universitat-zurich,campus-oerlikon/bim11/mittagsverpflegung/menu/weekly"
    );

    private static final Pattern FLIGHT_PUSH_PATTERN = Pattern.compile("self\\.__next_f\\.push\\((\\[.*?\\])\\)</script>", Pattern.DOTALL);

    private final UzhMensaClient uzhClient;
    private final MealEntityRepository mealRepository;
    private final JsonMapper jsonMapper;
    private final HttpClient httpClient;

    public UzhLiveMealImporter(UzhMensaClient uzhClient, MealEntityRepository mealRepository, JsonMapper jsonMapper) {
        this.uzhClient = uzhClient;
        this.mealRepository = mealRepository;
        this.jsonMapper = jsonMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void importOnStartup() {
        try {
            LocalDate today = LocalDate.now();
            importTodayUzhMeals(today);
            LocalDate monday = today.with(java.time.temporal.TemporalAdjusters.nextOrSame(java.time.DayOfWeek.MONDAY));
            if (!monday.equals(today)) {
                importTodayUzhMeals(monday);
            }
        } catch (Exception e) {
            log.warn("UZH startup import failed: {}", e.getMessage());
        }
    }

    @Transactional
    public int importTodayUzhMeals(LocalDate date) {
        Objects.requireNonNull(date, "date must not be null");
        List<MealEntity> toSave = new ArrayList<>();

        // 1. Try GraphQL client for standard endpoints
        for (Map.Entry<String, LocationMeta> entry : UZH_LOCATIONS.entrySet()) {
            String locationId = entry.getKey();
            LocationMeta meta = entry.getValue();

            try {
                String json = uzhClient.fetchTodayOffers(locationId);
                if (json != null && !json.isBlank()) {
                    List<MealEntity> parsed = parseLocationOffers(json, meta, date);
                    toSave.addAll(parsed);
                }
            } catch (Exception e) {
                // Fallback to official weekly Food2050 page
            }
        }

        // 2. Fetch official Food2050 weekly Next.js live pages for UZH mensas
        int week = date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
        int year = date.get(IsoFields.WEEK_BASED_YEAR);

        for (Map.Entry<String, String> entry : FOOD2050_WEEKLY_OUTLETS.entrySet()) {
            String mensaId = entry.getKey();
            String baseUrl = entry.getValue();
            try {
                List<MealEntity> scraped = scrapeFood2050Weekly(mensaId, baseUrl, week, year, date);
                for (MealEntity m : scraped) {
                    if (toSave.stream().noneMatch(existing -> existing.getId().equals(m.getId()))) {
                        toSave.add(m);
                    }
                }
            } catch (Exception e) {
                log.warn("Scraping Food2050 for {} failed: {}", mensaId, e.getMessage());
            }
        }

        mealRepository.saveAll(toSave);
        log.info("Live UZH meal import for date {} saved {} meals", date, toSave.size());
        return toSave.size();
    }

    public List<MealEntity> scrapeFood2050Weekly(String mensaId, String baseUrl, int week, int year, LocalDate targetDate) {
        List<MealEntity> results = new ArrayList<>();
        String url = String.format("%s?week=%d&year=%d", baseUrl, week, year);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(6))
                    .header("User-Agent", "Mozilla/5.0")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return results;
            }

            String html = response.body();
            Matcher matcher = FLIGHT_PUSH_PATTERN.matcher(html);
            StringBuilder flight = new StringBuilder();
            while (matcher.find()) {
                String jsonChunk = matcher.group(1);
                try {
                    JsonNode arr = jsonMapper.readTree(jsonChunk);
                    if (arr.isArray() && arr.size() >= 2 && arr.get(1).isTextual()) {
                        flight.append(arr.get(1).asText());
                    }
                } catch (Exception ignored) {}
            }

            String targetDateStr = targetDate.toString();
            String flightStr = flight.toString();
            int index = 1;

            for (String line : flightStr.split("\n")) {
                int colonIdx = line.indexOf(':');
                if (colonIdx <= 0 || !line.contains("menuCategory")) {
                    continue;
                }
                try {
                    JsonNode record = jsonMapper.readTree(line.substring(colonIdx + 1));
                    if (!record.isArray() || record.size() < 4) {
                        continue;
                    }
                    JsonNode outlet = record.get(3).path("outlet");
                    if (outlet.isMissingNode() || outlet.isNull()) {
                        continue;
                    }
                    JsonNode daily = outlet.path("menuCategory").path("calendar").path("week").path("daily");
                    if (!daily.isArray()) {
                        continue;
                    }

                    for (JsonNode day : daily) {
                        String dateLocal = day.path("from").path("dateLocal").asText("");
                        if (!dateLocal.startsWith(targetDateStr)) {
                            continue;
                        }

                        JsonNode items = day.path("menuItems");
                        if (!items.isArray()) {
                            continue;
                        }

                        for (JsonNode item : items) {
                            JsonNode dish = item.path("dish");
                            if (dish.isMissingNode() || dish.isNull()) {
                                continue;
                            }
                            String title = dish.path("name").asText("").trim();
                            if (title.isBlank()) {
                                continue;
                            }
                            String description = dish.path("description").asText("").trim();
                            boolean isVegan = dish.path("isVegan").asBoolean(false);
                            boolean isVegetarian = dish.path("isVegetarian").asBoolean(false);

                            String dietTag = isVegan ? "vegan" : (isVegetarian ? "vegetarian" : "meat");
                            BigDecimal priceStudent = isVegetarian || isVegan ? BigDecimal.valueOf(6.10) : BigDecimal.valueOf(7.50);
                            BigDecimal priceStaff = isVegetarian || isVegan ? BigDecimal.valueOf(9.00) : BigDecimal.valueOf(10.50);
                            BigDecimal priceExternal = isVegetarian || isVegan ? BigDecimal.valueOf(13.00) : BigDecimal.valueOf(15.50);

                            JsonNode prices = item.path("prices");
                            if (prices.isArray() && prices.size() > 0) {
                                for (JsonNode p : prices) {
                                    double amount = p.path("amount").asDouble(0.0);
                                    String cat = p.path("category").path("title").asText("").toLowerCase();
                                    if (cat.contains("stud")) priceStudent = BigDecimal.valueOf(amount);
                                    else if (cat.contains("mitarb") || cat.contains("staff")) priceStaff = BigDecimal.valueOf(amount);
                                    else if (cat.contains("ext") || cat.contains("gast")) priceExternal = BigDecimal.valueOf(amount);
                                }
                            }

                            List<String> allergens = new ArrayList<>();
                            JsonNode allergensNode = dish.path("allergens");
                            if (allergensNode.isArray()) {
                                for (JsonNode a : allergensNode) {
                                    String aName = a.path("allergen").path("externalId").asText("");
                                    if (!aName.isBlank()) allergens.add(aName);
                                }
                            }

                            List<String> components = new ArrayList<>();
                            components.add(title);
                            if (!description.isBlank()) {
                                components.add(description);
                            }

                            String mealId = String.format("%s.%s.lunch.%d", mensaId, targetDateStr, index++);
                            results.add(new MealEntity(
                                    mealId,
                                    mensaId,
                                    targetDate,
                                    "lunch",
                                    "Daily Special",
                                    "lunch",
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
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.warn("Failed to scrape Food2050 for {}: {}", mensaId, e.getMessage());
        }
        return results;
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

                    String mealId = String.format("%s.%s.%s.%d", meta.mensaId(), date, meta.service(), index++);
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
