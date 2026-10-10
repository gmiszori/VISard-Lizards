package com.visardlizards.backend.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.EthMensaClient;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EthLiveMealImporterTests {

    private static final String SAMPLE_ETH_JSON = """
            {
                "weekly-rota-array": [
                    {
                        "weekly-rota-id": 101,
                        "facility-id": 22,
                        "valid-from": "2026-10-12",
                        "valid-to": "2026-10-18",
                        "day-of-week-array": [
                            {
                                "day-of-week-code": 1,
                                "day-of-week-desc": "Montag",
                                "opening-hour-array": [
                                    {
                                        "time-from": "11:00",
                                        "time-to": "14:00",
                                        "meal-time-array": [
                                            {
                                                "name": "Mittag",
                                                "line-array": [
                                                    {
                                                        "name": "Rice Up! Bowl",
                                                        "meal": {
                                                            "line-id": 9991,
                                                            "name": "Crispy Tofu Bowl",
                                                            "description": "Jasmine Rice | Crispy Tofu | Broccoli | Green Curry",
                                                            "meal-class-array": [
                                                                {"desc": "Vegan"}
                                                            ],
                                                            "allergen-array": [
                                                                {"desc": "Soja"},
                                                                {"desc": "Sesam"}
                                                            ],
                                                            "meal-price-array": [
                                                                {"customer-group-code": 10, "price": 9.50},
                                                                {"customer-group-code": 11, "price": 12.50},
                                                                {"customer-group-code": 12, "price": 15.00}
                                                            ]
                                                        }
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
            """;

    @Test
    void testLiveImportParsesAndSavesMeals() {
        EthMensaClient client = mock(EthMensaClient.class);
        MealEntityRepository mealRepo = mock(MealEntityRepository.class);
        JsonMapper mapper = JsonMapper.builder().build();

        LocalDate testDate = LocalDate.of(2026, 10, 12);
        when(client.fetchWeeklyRotaPages(eq(testDate), eq("de")))
                .thenReturn(List.of(SAMPLE_ETH_JSON));

        EthLiveMealImporter importer = new EthLiveMealImporter(client, mealRepo, mapper);
        int count = importer.importLiveEthMeals(testDate);

        assertEquals(1, count);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MealEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(mealRepo).saveAll(captor.capture());

        List<MealEntity> saved = captor.getValue();
        assertEquals(1, saved.size());

        MealEntity meal = saved.get(0);
        assertEquals("rice-up.2026-10-12.lunch.9991", meal.getId());
        assertEquals("rice-up", meal.getMensaId());
        assertEquals(LocalDate.of(2026, 10, 12), meal.getDate());
        assertEquals("lunch", meal.getService());
        assertEquals("Rice Up! Bowl", meal.getLine());
        assertEquals("Crispy Tofu Bowl", meal.getTitle());
        assertEquals("vegan", meal.getDietTag());
        assertEquals(BigDecimal.valueOf(9.5), meal.getPriceStudent());
        assertEquals(BigDecimal.valueOf(12.5), meal.getPriceStaff());
        assertEquals(BigDecimal.valueOf(15.0), meal.getPriceExternal());

        assertEquals(List.of("Jasmine Rice", "Crispy Tofu", "Broccoli", "Green Curry"), meal.getComponents());
        assertEquals(List.of("Soja", "Sesam"), meal.getAllergens());
    }
}
