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
import com.visardlizards.backend.service.EthMensaClient;
import com.visardlizards.backend.service.MealEmbeddingService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Parses raw ETH Cookpit weekly rotas and persists live meals into the JPA database.
 */
@Component
public class EthLiveMealImporter {

    private static final Logger log = LoggerFactory.getLogger(EthLiveMealImporter.class);

    private static final Map<Integer, String> FACILITY_TO_MENSA = Map.ofEntries(
            Map.entry(8, "archimedes"),
            Map.entry(3, "clausiusbar"),
            Map.entry(5, "dozentenfoyer"),
            Map.entry(7, "food-and-lab"),
            Map.entry(9, "polyterrasse"),
            Map.entry(10, "polysnack"),
            Map.entry(11, "tannenbar"),
            Map.entry(14, "alumni-quattro-lounge"),
            Map.entry(19, "food-market"),
            Map.entry(20, "fusion-meal"),
            Map.entry(16, "mendokoro"),
            Map.entry(22, "rice-up")
    );

    private final EthMensaClient ethClient;
    private final MealEntityRepository mealRepository;
    private final JsonMapper jsonMapper;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private MealEmbeddingService embeddingService;

    public EthLiveMealImporter(EthMensaClient ethClient, MealEntityRepository mealRepository, JsonMapper jsonMapper) {
        this.ethClient = ethClient;
        this.mealRepository = mealRepository;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Fetches all live weekly rota pages from ETH for the given week and imports them into the DB.
     *
     * @param date A date in the desired week
     * @return count of meals imported or updated
     */
    @Transactional
    public int importLiveEthMeals(LocalDate date) {
        Objects.requireNonNull(date, "date must not be null");
        List<String> pages = ethClient.fetchWeeklyRotaPages(date, "de");
        List<MealEntity> toSave = new ArrayList<>();

        for (String pageJson : pages) {
            try {
                JsonNode root = jsonMapper.readTree(pageJson);
                JsonNode rotas = root.path("weekly-rota-array");
                if (!rotas.isArray()) {
                    continue;
                }
                for (JsonNode rota : rotas) {
                    int facilityId = rota.path("facility-id").asInt(0);
                    String mensaId = FACILITY_TO_MENSA.get(facilityId);
                    if (mensaId == null) {
                        continue;
                    }
                    String validFromStr = rota.path("valid-from").asText("");
                    if (validFromStr.isBlank()) {
                        continue;
                    }
                    LocalDate validFrom = LocalDate.parse(validFromStr);

                    JsonNode days = rota.path("day-of-week-array");
                    if (!days.isArray()) {
                        continue;
                    }
                    for (JsonNode day : days) {
                        int dow = day.path("day-of-week-code").asInt(1);
                        LocalDate mealDate = validFrom.plusDays(dow - 1);

                        JsonNode openingHours = day.path("opening-hour-array");
                        if (!openingHours.isArray()) {
                            continue;
                        }
                        for (JsonNode oh : openingHours) {
                            JsonNode mealTimes = oh.path("meal-time-array");
                            if (!mealTimes.isArray()) {
                                continue;
                            }
                            for (JsonNode mt : mealTimes) {
                                String mealTimeName = mt.path("name").asText("Mittag");
                                String service = mealTimeName.toLowerCase().contains("abend") ? "dinner" : "lunch";

                                JsonNode lines = mt.path("line-array");
                                if (!lines.isArray()) {
                                    continue;
                                }
                                for (JsonNode lineNode : lines) {
                                    String lineName = lineNode.path("name").asText("Daily");
                                    JsonNode mealNode = lineNode.path("meal");
                                    if (mealNode.isMissingNode() || mealNode.isNull()) {
                                        continue;
                                    }

                                    long lineId = mealNode.path("line-id").asLong(0);
                                    String title = mealNode.path("name").asText("").trim();
                                    if (title.isBlank()) {
                                        continue;
                                    }

                                    String description = mealNode.path("description").asText("");
                                    List<String> components = parseComponents(description);

                                    String dietTag = parseDietTag(mealNode.path("meal-class-array"));
                                    List<String> allergens = parseAllergens(mealNode.path("allergen-array"));

                                    BigDecimal priceStudent = null;
                                    BigDecimal priceStaff = null;
                                    BigDecimal priceExternal = null;

                                    JsonNode prices = mealNode.path("meal-price-array");
                                    if (prices.isArray()) {
                                        for (JsonNode p : prices) {
                                            int group = p.path("customer-group-code").asInt();
                                            double val = p.path("price").asDouble();
                                            if (val > 0) {
                                                BigDecimal bd = BigDecimal.valueOf(val);
                                                if (group == 10) {
                                                    priceStudent = bd;
                                                } else if (group == 11) {
                                                    priceStaff = bd;
                                                } else if (group == 12) {
                                                    priceExternal = bd;
                                                }
                                            }
                                        }
                                    }

                                    String mealId = String.format("%s.%s.%s.%d", mensaId, mealDate, service, lineId);
                                    toSave.add(new MealEntity(
                                            mealId, mensaId, mealDate, service, lineName, "main", title,
                                            dietTag, priceStudent, priceStaff, priceExternal,
                                            null, null, components, allergens
                                    ));
                                }
                            }
                        }
                    }
                }
            } catch (Exception ex) {
                log.warn("Failed to parse page during live import: {}", ex.getMessage());
            }
        }

        if (embeddingService != null) embeddingService.fill(toSave);
        mealRepository.saveAll(toSave);
        log.info("Live ETH meal import for date {} saved {} meals", date, toSave.size());
        return toSave.size();
    }

    private static List<String> parseComponents(String description) {
        if (description == null || description.isBlank()) {
            return List.of();
        }
        String[] parts = description.split("\\s*\\|\\s*");
        List<String> list = new ArrayList<>();
        for (String p : parts) {
            String trimmed = p.trim();
            if (!trimmed.isBlank()) {
                list.add(trimmed);
            }
        }
        return list;
    }

    private static String parseDietTag(JsonNode mealClassArray) {
        if (mealClassArray == null || !mealClassArray.isArray()) {
            return "unknown";
        }
        for (JsonNode c : mealClassArray) {
            String desc = c.path("desc").asText("").toLowerCase();
            if (desc.contains("vegan")) {
                return "vegan";
            }
            if (desc.contains("vegetarisch")) {
                return "vegetarian";
            }
            if (desc.contains("fleisch")) {
                return "meat";
            }
            if (desc.contains("fisch")) {
                return "fish";
            }
        }
        return "unknown";
    }

    private static List<String> parseAllergens(JsonNode allergenArray) {
        if (allergenArray == null || !allergenArray.isArray()) {
            return List.of();
        }
        List<String> list = new ArrayList<>();
        for (JsonNode a : allergenArray) {
            String desc = a.path("desc").asText("").trim();
            if (!desc.isBlank()) {
                list.add(desc);
            }
        }
        return list;
    }
}
