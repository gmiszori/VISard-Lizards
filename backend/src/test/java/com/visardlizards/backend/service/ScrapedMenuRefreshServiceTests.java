package com.visardlizards.backend.service;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScrapedMenuRefreshServiceTests {
    @TempDir Path dir;
    @Test void persistsAllLocationsAndKeepsLastSuccessOnFailure() throws Exception {
        var mapper=JsonMapper.builder().build(); var ai=mock(ScraperAiClient.class);
        when(ai.retrieve(anyString())).thenReturn(mapper.readTree("{\"toolResults\":[],\"explanation\":\"Saved meals\"}"));
        var file=dir.resolve("menus.json");
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,false,file.toString()))) {
            service.value.refresh(); var first=service.value.snapshot();
            assertEquals(39,first.path("cafeterias").size());
            for(var venue:first.path("cafeterias")) assertFalse(venue.path("stale").asBoolean());
            when(ai.retrieve(anyString())).thenThrow(new IllegalStateException("secret-test-key"));
            service.value.refresh(); var failed=service.value.snapshot();
            for(var venue:failed.path("cafeterias")) { if(!venue.has("result")) continue; assertTrue(venue.path("stale").asBoolean()); assertEquals("Saved meals",venue.path("result").path("explanation").asText()); }
            assertFalse(failed.toString().contains("secret-test-key"));
        }
        try(var restored=new TestClose(new ScrapedMenuRefreshService(ai,mapper,false,file.toString()))) {
            assertEquals("Saved meals",restored.value.snapshot().path("cafeterias").get(0).path("result").path("explanation").asText());
        }
    }
    @Test void disabledOrUnconfiguredSchedulerDoesNotRun() throws Exception {
        var ai=mock(ScraperAiClient.class); var mapper=JsonMapper.builder().build();
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,false,dir.resolve("disabled.json").toString()))) {service.value.onStartup(); service.value.onSchedule();}
        verify(ai,never()).retrieve(anyString());
        try(var service=new TestClose(new ScrapedMenuRefreshService(ai,mapper,true,dir.resolve("nokey.json").toString()))) {service.value.onStartup(); service.value.onSchedule();}
        verify(ai,never()).retrieve(anyString());
    }
    private record TestClose(ScrapedMenuRefreshService value) implements AutoCloseable { public void close() { value.close(); } }
}
