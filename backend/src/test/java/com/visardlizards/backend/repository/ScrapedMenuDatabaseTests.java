package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.*;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ScrapedMenuDatabaseTests {
    @Autowired ScrapedMenuStore store;
    @Autowired ScrapedMenuEntityRepository raw;
    @Autowired MealEntityRepository meals;
    @Autowired JsonMapper mapper;
    @Autowired MockMvc mvc;
    @Autowired MensaRepository publicMeals;
    private final LocalDate today=LocalDate.now(ZoneId.of("Europe/Zurich"));

    @Test void traceAllergensSurviveNewScrapesAndOlderCachedDetailsSeparately() throws Exception {
        for(String metadata:List.of("\"traceAllergens\":[\"Glutenhaltiges Getreide\",\"Sellerie\"]",
                "\"details\":{\"dish\":{\"traceAllergens\":[{\"allergen\":{\"name\":\"Glutenhaltiges Getreide\"}},{\"allergen\":{\"externalId\":\"Sellerie\"}}]}}")) {
            store.save(mapper.readTree("""
                {"id":"scraper-test","result":{"toolResults":[{"name":"scrape_meals","data":{"meals":[
                {"name":"Cauliflower","date":"%s","allergens":["Sesam"],%s} ]}}]}}
                """.formatted(today,metadata)));
            var meal=publicMeals.findMeals("scraper-test",today,today).getFirst();
            assertEquals(List.of("Sesam"),meal.allergens());
            assertEquals(List.of("Glutenhaltiges Getreide","Sellerie"),meal.traceAllergens());
            mvc.perform(get("/api/meals/"+meal.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.meal.allergens[0]").value("Sesam"))
                .andExpect(jsonPath("$.meal.traceAllergens[0]").value("Glutenhaltiges Getreide"))
                .andExpect(jsonPath("$.meal.traceAllergens[1]").value("Sellerie"));
        }
    }

    @Test void manualRefreshEndpointRejectsAnonymousRequests() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/scraped-menus/refresh"))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value("unauthorized"));
    }

    @Test void rawResultsAndPublicMealsPersistWithStableIdsAndRecurringDates() {
        var entry=mapper.readTree("""
            {"id":"scraper-test","stale":false,"result":{"toolResults":[{"name":"scrape_meals","data":{"meals":[
            {"name":"Daily soup","date":null,"dietaryLabels":["vegan"],"price":{"amount":5.5,"currency":"CHF"},"sourceUrl":"https://example.org/menu"},
            {"name":"Daily soup","date":null,"dietaryLabels":["vegan"],"price":{"amount":5.5,"currency":"CHF"},"sourceUrl":"https://example.org/menu"}
            ],"availability":[]}}]}}""");
        store.save(entry); store.save(entry);
        assertEquals(entry,store.get("scraper-test"));
        assertTrue(raw.findById("scraper-test").isPresent());
        var rows=meals.findByMensaIdAndDateBetweenOrderByDateAsc("scraper-test",today,today.plusDays(14));
        assertEquals(15,rows.size()); // One per day, no duplicate tool entries or repeated saves.
        assertEquals("vegan",rows.get(0).getDietTag());
        assertEquals(0,rows.get(0).getPriceStudent().compareTo(new java.math.BigDecimal("5.50")));
        assertTrue(rows.get(0).getComponents().contains("Every day"));
        store.projectCached("scraper-test",today.plusDays(20),today.plusDays(20));
        assertEquals(1,meals.findByMensaIdAndDateBetweenOrderByDateAsc("scraper-test",today.plusDays(20),today.plusDays(20)).size());
    }
    @Test void closuresSuppressRecurringMealsAndUpstreamRowsArePreserved() {
        meals.saveAndFlush(new MealEntity("upstream-test","scraper-test",today,"lunch","Main","main","Upstream lunch","vegan",null,null,null,null,null,List.of(),List.of()));
        var entry=mapper.readTree("""
            {"id":"scraper-test","result":{"toolResults":[{"name":"scrape_meals","data":{"meals":[{"name":"Soup"}],
            "availability":[{"dateFrom":"%s","dateTo":"%s","evidence":"Closed"}]}}]}}
            """.formatted(today.plusDays(1),today.plusDays(2)));
        store.save(entry);
        assertEquals("Upstream lunch",meals.findByMensaIdAndDateBetweenOrderByDateAsc("scraper-test",today,today).get(0).getTitle());
        assertTrue(meals.findByMensaIdAndDateBetweenOrderByDateAsc("scraper-test",today.plusDays(1),today.plusDays(2)).isEmpty());
    }
    @Test void missingDatabaseCallsMcpOnceThenUsesStoredEmptyResult() throws Exception {
        raw.deleteById("bqm");
        var ai=mock(ScraperAiClient.class); when(ai.configured()).thenReturn(true);
        when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenReturn(mapper.readTree("{\"toolResults\":[{\"name\":\"scrape_meals\",\"data\":{\"meals\":[]}}]}"));
        var refresh=new ScrapedMenuRefreshService(ai,mapper,store,true,"target/nonexistent-legacy-menus.json");
        try {
            refresh.ensureMeals("bqm",today,today);
            refresh.ensureMeals("bqm",today,today);
            verify(ai,times(1)).retrieve(eq("https://bqm-bar.ch/de"), eq(java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"))));
            assertNotNull(store.get("bqm"));
        } finally { refresh.close(); }
    }
    @Test void failuresAreCachedWithoutDiscardingLastSuccessfulEvidence() throws Exception {
        var previous=mapper.readTree("""
            {"id":"bqm","lastAttempt":"2020-01-01T00:00:00Z","result":{"toolResults":[],"explanation":"Previous evidence"}}
            """); store.save(previous);
        var ai=mock(ScraperAiClient.class); when(ai.configured()).thenReturn(true);
        when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenThrow(new IllegalStateException("secret-key"));
        var refresh=new ScrapedMenuRefreshService(ai,mapper,store,true,"target/nonexistent-legacy-menus.json");
        try {
            refresh.ensureMeals("bqm",today,today); refresh.ensureMeals("bqm",today,today);
            verify(ai,times(1)).retrieve(anyString(), any(java.time.LocalDate.class));
            assertTrue(store.get("bqm").path("stale").asBoolean());
            assertEquals("Previous evidence",store.get("bqm").path("result").path("explanation").asText());
            assertFalse(store.get("bqm").toString().contains("secret-key"));
        } finally { refresh.close(); }
    }
    @Test void existingFrontendEndpointsServeStoredMcpMealsAndLaterPreferUpstream() throws Exception {
        var entry=mapper.readTree("""
            {"id":"bqm","lastAttempt":"%s","result":{"toolResults":[{"name":"scrape_meals","data":{"meals":[{"name":"MCP test soup","date":"%s"}],"availability":[]}}]}}
            """.formatted(Instant.now(),today));
        store.save(entry);
        var actual=publicMeals.findMeals("bqm",today,today);
        assertEquals(1,actual.size());
        mvc.perform(get("/api/mensas/bqm/meal-plan").param("dateStart",today.toString()).param("dateEnd",today.toString()))
            .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("MCP test soup")));
        mvc.perform(get("/api/meals/"+actual.get(0).id())).andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("MCP test soup")));
        meals.saveAndFlush(new MealEntity("new-upstream-test","bqm",today,"lunch","Main","main","New upstream lunch","vegan",null,null,null,null,null,List.of(),List.of()));
        var preferred=publicMeals.findMeals("bqm",today,today);
        assertEquals(1,preferred.size()); assertEquals("New upstream lunch",preferred.get(0).title());
    }
}
