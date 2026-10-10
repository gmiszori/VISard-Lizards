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
        when(ai.retrieve(anyString())).thenReturn(mapper.readTree("{\"toolResults\":[],\"explanation\":\"Saved meals\"}"));
        var file=dir.resolve("menus.json");
        var store=memoryStore();
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,store,false,file.toString()))) {
            service.value.refresh(); var first=service.value.snapshot();
            assertEquals(39,first.path("cafeterias").size());
            for(var venue:first.path("cafeterias")) assertFalse(venue.path("stale").asBoolean());
            when(ai.retrieve(anyString())).thenThrow(new IllegalStateException("secret-test-key"));
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
        verify(ai,never()).retrieve(anyString());
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,memoryStore(),true,dir.resolve("nokey.json").toString()))) {service.value.onStartup(); service.value.onSchedule();}
        verify(ai,never()).retrieve(anyString());
    }
    private record TestClose(ScrapedMenuRefreshService value) implements AutoCloseable { public void close() { value.close(); } }
    private static ScrapedMenuStore memoryStore() {
        var store=mock(ScrapedMenuStore.class);
        var rows=new java.util.concurrent.ConcurrentHashMap<String,tools.jackson.databind.JsonNode>();
        when(store.all()).thenAnswer(call -> java.util.List.copyOf(rows.values()));
        when(store.get(anyString())).thenAnswer(call -> rows.get(call.getArgument(0)));
        doAnswer(call -> { tools.jackson.databind.JsonNode entry=call.getArgument(0); rows.put(entry.path("id").asText(),entry); return null; }).when(store).save(any());
        return store;
    }
}
