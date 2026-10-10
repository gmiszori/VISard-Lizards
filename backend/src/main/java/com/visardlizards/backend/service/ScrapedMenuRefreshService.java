package com.visardlizards.backend.service;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** One daily batch per backend instance. Requests only read snapshots, never trigger AI charges. */
@Service
public class ScrapedMenuRefreshService {
    private final ScraperAiClient ai;
    private final JsonMapper mapper;
    private final boolean enabled;
    private final Path file;
    private final JsonNode locations;
    private final ConcurrentHashMap<String,JsonNode> saved=new ConcurrentHashMap<>();
    private final AtomicBoolean running=new AtomicBoolean();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile String lastAttempt, lastCompleted;
    public ScrapedMenuRefreshService(ScraperAiClient ai, JsonMapper mapper,
            @Value("${app.scraper.enabled:true}") boolean enabled,
            @Value("${app.scraper.snapshot-file:./data/scraped-menus.json}") String file) throws java.io.IOException {
        this.ai=ai; this.mapper=mapper; this.enabled=enabled; this.file=Path.of(file).toAbsolutePath();
        this.locations=mapper.readTree(new ClassPathResource("mensa/scraper-locations.json").getContentAsString(StandardCharsets.UTF_8));
        if(Files.isRegularFile(this.file)) {
            try {
                JsonNode stored=mapper.readTree(Files.readString(this.file));
                for(JsonNode entry:stored.path("cafeterias")) saved.put(entry.path("id").asText(),entry);
                lastCompleted=stored.path("lastCompleted").asText(null);
            } catch(RuntimeException | java.io.IOException ex) { System.err.println("Scraped menu snapshot unreadable; waiting for next refresh."); }
        }
    }
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() { enqueue(); }
    @Scheduled(cron="${app.scraper.cron:0 0 6 * * *}",zone="Europe/Zurich")
    public void onSchedule() { enqueue(); }
    public void enqueue() {
        if(enabled && ai.configured() && running.compareAndSet(false,true)) worker.submit(() -> {
            try { refresh(); } finally { running.set(false); }
        });
    }
    void refresh() {
        lastAttempt=Instant.now().toString();
        for(JsonNode venue:locations) {
            String id=venue.path("id").asText();
            var entry=mapper.createObjectNode();
            for(String field:java.util.List.of("id","name","url")) entry.set(field,venue.get(field));
            entry.put("lastAttempt",Instant.now().toString());
            try {
                if(!venue.path("url").isTextual()) {
                    entry.put("status","source_unavailable").put("error","No verified venue menu URL is configured.").put("stale",false);
                } else {
                    entry.set("result",ai.retrieve(venue.path("url").asText()));
                    entry.put("updatedAt",Instant.now().toString()).put("stale",false);
                }
            } catch(RuntimeException ex) {
                // Provider/connector errors can contain credentials: expose and log only a fixed message.
                JsonNode previous=saved.get(id);
                if(previous!=null && previous.has("result")) { entry.set("result",previous.get("result")); entry.set("updatedAt",previous.get("updatedAt")); }
                entry.put("stale",true).put("error","Refresh failed; check backend key, model and scraper connection.");
            }
            saved.put(id,entry);
            persist(); // Partial progress survives interruption and individual failures.
        }
        lastCompleted=Instant.now().toString(); persist();
    }
    public JsonNode snapshot() {
        var root=mapper.createObjectNode().put("enabled",enabled).put("configured",ai.configured()).put("running",running.get())
            .put("timeZone","Europe/Zurich").put("lastAttempt",lastAttempt).put("lastCompleted",lastCompleted);
        var cafeterias=mapper.createArrayNode();
        for(JsonNode venue:locations) {
            JsonNode entry=saved.get(venue.path("id").asText());
            if(entry==null) { var pending=mapper.createObjectNode(); pending.setAll((tools.jackson.databind.node.ObjectNode)venue); pending.put("status","pending"); cafeterias.add(pending); }
            else cafeterias.add(entry);
        }
        root.set("cafeterias",cafeterias); return root;
    }
    private void persist() {
        try {
            Files.createDirectories(file.getParent());
            Path temp=Files.createTempFile(file.getParent(),"scraped-menus-",".tmp");
            try {
                Files.writeString(temp,snapshot().toString());
                try { Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE); }
                catch(AtomicMoveNotSupportedException ex) { Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING); }
            } finally { Files.deleteIfExists(temp); }
        } catch(java.io.IOException ex) { System.err.println("Could not persist scraped menus; in-memory results remain available."); }
    }
    @PreDestroy public void close() { worker.shutdownNow(); }
}
