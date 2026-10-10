package com.visardlizards.backend.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.UzhMensaClient;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class UzhLiveMealImporterTests {

    @Test
    void disabledStartupDoesNotFetchOrWriteMeals() {
        UzhMensaClient client = mock(UzhMensaClient.class);
        MealEntityRepository repo = mock(MealEntityRepository.class);
        UzhLiveMealImporter importer = new UzhLiveMealImporter(client, repo, JsonMapper.builder().build());
        ReflectionTestUtils.setField(importer, "liveImportEnabled", false);

        importer.importOnStartup();

        verifyNoInteractions(client, repo);
    }

    private static final String SAMPLE_GRAPHQL_RESPONSE = """
    {
      "data": {
        "location": {
          "kitchens": [
            {
              "slug": "menu-1",
              "todayOffer": {
                "digitalMenuItems": [
                  {
                    "displayName": "Daily Special Vegan",
                    "recipe": {
                      "title": "Kichererbsen-Curry mit Basmatireis",
                      "prices": [
                        { "amount": 7.50, "category": { "title": "Student" } },
                        { "amount": 10.50, "category": { "title": "Mitarbeiter" } },
                        { "amount": 13.50, "category": { "title": "Gast" } }
                      ],
                      "allergensList": ["Gluten", "Soja"]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }""";

    @Test
    void testParseLocationOffers() {
        UzhMensaClient client = mock(UzhMensaClient.class);
        MealEntityRepository repo = mock(MealEntityRepository.class);
        JsonMapper mapper = JsonMapper.builder().build();

        UzhLiveMealImporter importer = new UzhLiveMealImporter(client, repo, mapper);
        LocalDate date = LocalDate.of(2026, 10, 10);
        UzhLiveMealImporter.LocationMeta meta = new UzhLiveMealImporter.LocationMeta("obere-mensa", "lunch");

        List<MealEntity> meals = importer.parseLocationOffers(SAMPLE_GRAPHQL_RESPONSE, meta, date);

        assertEquals(1, meals.size());
        MealEntity m = meals.get(0);
        assertEquals("obere-mensa", m.getMensaId());
        assertEquals("Kichererbsen-Curry mit Basmatireis", m.getTitle());
        assertEquals("vegan", m.getDietTag());
        assertEquals(BigDecimal.valueOf(7.5), m.getPriceStudent());
        assertEquals(BigDecimal.valueOf(10.5), m.getPriceStaff());
        assertEquals(BigDecimal.valueOf(13.5), m.getPriceExternal());
        assertEquals(List.of("Gluten", "Soja"), m.getAllergens());
    }

    @Test
    void testImportTodayUzhMealsCallsSaveAll() {
        UzhMensaClient client = mock(UzhMensaClient.class);
        MealEntityRepository repo = mock(MealEntityRepository.class);
        JsonMapper mapper = JsonMapper.builder().build();

        when(client.fetchTodayOffers(any())).thenReturn(SAMPLE_GRAPHQL_RESPONSE);

        UzhLiveMealImporter importer = new UzhLiveMealImporter(client, repo, mapper) {
            @Override
            public List<MealEntity> scrapeFood2050Weekly(String mensaId, String baseUrl, int week, int year, LocalDate targetDate) {
                return List.of();
            }
        };
        LocalDate date = LocalDate.of(2026, 10, 10);

        int count = importer.importTodayUzhMeals(date);
        assertEquals(UzhLiveMealImporter.UZH_LOCATIONS.size(), count);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MealEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertNotNull(captor.getValue());
        assertEquals(UzhLiveMealImporter.UZH_LOCATIONS.size(), captor.getValue().size());
    }
}
