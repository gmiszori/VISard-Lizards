package com.visardlizards.backend.service;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.visardlizards.backend.repository.ScrapedMenuStore;

class ScrapedMenuRefreshServiceTests {
    @TempDir Path dir;
    @Test void persistsAllLocationsAndKeepsLastSuccessOnFailure() throws Exception {
        var mapper=JsonMapper.builder().build(); var ai=mock(ScraperAiClient.class);
        when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenReturn(mapper.readTree("{\"toolResults\":[],\"explanation\":\"Saved meals\"}"));
        var file=dir.resolve("menus.json");
        var store=memoryStore();
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,store,false,file.toString()))) {
            service.value.refresh(); var first=service.value.snapshot();
            assertEquals(37,first.path("cafeterias").size());
            for(var venue:first.path("cafeterias")) assertFalse(venue.path("stale").asBoolean());
            when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenThrow(new IllegalStateException("secret-test-key"));
            service.value.refresh(); var failed=service.value.snapshot();
            for(var venue:failed.path("cafeterias")) { if(!venue.has("result")) continue; assertTrue(venue.path("stale").asBoolean()); assertEquals("Saved meals",venue.path("result").path("explanation").asText()); }
            assertFalse(failed.toString().contains("secret-test-key"));
        }
        try(var restored=new TestClose(new ScrapedMenuRefreshService(ai,mapper,store,false,file.toString()))) {
            assertEquals("Saved meals",restored.value.snapshot().path("cafeterias").get(0).path("result").path("explanation").asText());
        }
    }
    @Test void disabledOrUnconfiguredSchedulerDoesNotRun() throws Exception {
        var ai=mock(ScraperAiClient.class); var mapper=JsonMapper.builder().build();
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,memoryStore(),false,dir.resolve("disabled.json").toString()))) {service.value.onStartup(); service.value.onSchedule();}
        verify(ai,never()).retrieve(anyString(), any(java.time.LocalDate.class));
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,memoryStore(),true,dir.resolve("nokey.json").toString()))) {service.value.onStartup(); service.value.onSchedule();}
        verify(ai,never()).retrieve(anyString(), any(java.time.LocalDate.class));
    }
    @Test void changedVenueUrlInvalidatesAnOtherwiseFreshEmptyCache() throws Exception {
        var mapper=JsonMapper.builder().build(); var ai=mock(ScraperAiClient.class); var store=memoryStore();
        when(ai.configured()).thenReturn(true);
        when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenReturn(mapper.readTree("{\"toolResults\":[]}"));
        store.save(mapper.createObjectNode().put("id","mendokoro").put("url","https://ethz.ch/old-source")
            .put("lastAttempt",java.time.Instant.now().toString()).set("result",mapper.createObjectNode()));
        var today=java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"));
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,store,true,dir.resolve("unused.json").toString()))) {
            service.value.ensureMeals("mendokoro",today,today); service.value.ensureMeals("mendokoro",today,today);
        }
        verify(ai,times(1)).retrieve(eq("https://ethz.ch/en/campus/erleben/gastronomie-und-einkaufen/gastronomie/menueplaene/offerWeek.html?date=2026-10-12&id=16"), eq(java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"))));
    }
    @Test void manualRefreshBypassesFreshCacheAndDoesNotStartDuplicateBatch() throws Exception {
        var mapper=JsonMapper.builder().build(); var ai=mock(ScraperAiClient.class); var store=memoryStore();
        when(ai.configured()).thenReturn(true);
        var entered=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        when(ai.retrieve(anyString(), any(java.time.LocalDate.class))).thenAnswer(call -> {
            entered.countDown();
            if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
            return mapper.readTree("{\"toolResults\":[]}");
        });
        store.save(mapper.createObjectNode().put("id","mendokoro")
            .put("url","https://ethz.ch/en/campus/erleben/gastronomie-und-einkaufen/gastronomie/menueplaene/offerWeek.html?date=2026-10-12&id=16")
            .put("lastAttempt",java.time.Instant.now().toString()).set("result",mapper.createObjectNode()));
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,store,true,dir.resolve("unused.json").toString()))) {
            assertTrue(service.value.handleConsoleCommand(" r "));
            assertTrue(entered.await(5,java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(service.value.handleConsoleCommand("R"));
            release.countDown();
            verify(ai,timeout(5000).times(1)).retrieve(eq("https://ethz.ch/en/campus/erleben/gastronomie-und-einkaufen/gastronomie/menueplaene/offerWeek.html?date=2026-10-12&id=16"), eq(java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"))));
        } finally { release.countDown(); }
    }
    private record TestClose(ScrapedMenuRefreshService value) implements AutoCloseable { public void close() { value.close(); } }
    @Test void consoleIgnoresOtherInputStopsAtEofAndHonorsConfiguration() throws Exception {
        var ai=mock(ScraperAiClient.class); var mapper=JsonMapper.builder().build();
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,memoryStore(),false,dir.resolve("console.json").toString()))) {
            assertFalse(service.value.handleConsoleCommand("refresh"));
            assertFalse(service.value.handleConsoleCommand(null));
            assertTrue(service.value.handleConsoleCommand("r"));
            service.value.readConsoleCommands(new java.io.BufferedReader(new java.io.StringReader("\nignore\nR\n")));
        }
        verifyNoInteractions(ai);
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,memoryStore(),true,dir.resolve("nokey-console.json").toString()))) {
            assertTrue(service.value.handleConsoleCommand("r"));
        }
        verify(ai,never()).retrieve(anyString(), any(java.time.LocalDate.class));
    }
    private static ScrapedMenuStore memoryStore() {
        var store=mock(ScrapedMenuStore.class);
        var rows=new java.util.concurrent.ConcurrentHashMap<String,tools.jackson.databind.JsonNode>();
        when(store.all()).thenAnswer(call -> java.util.List.copyOf(rows.values()));
        when(store.get(anyString())).thenAnswer(call -> rows.get(call.getArgument(0)));
        doAnswer(call -> { tools.jackson.databind.JsonNode entry=call.getArgument(0); rows.put(entry.path("id").asText(),entry); return null; }).when(store).save(any());
        return store;
    }
}
