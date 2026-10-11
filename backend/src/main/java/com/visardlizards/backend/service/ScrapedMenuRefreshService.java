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
import com.visardlizards.backend.repository.ScrapedMenuStore;

/** Daily refresh and database-first cache-miss retrieval, serialized per cafeteria. */
@Service
public class ScrapedMenuRefreshService {
    private final ScraperAiClient ai;
    private final JsonMapper mapper;
    private final ScrapedMenuStore store;
    private final boolean enabled;
    private final Path file;
    private final JsonNode locations;
    private final ConcurrentHashMap<String,Object> locks=new ConcurrentHashMap<>();
    private final AtomicBoolean running=new AtomicBoolean();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    @Value("${app.scraper.console-enabled:true}")
    private boolean consoleEnabled;
    private volatile boolean closed;
    private Thread consoleThread;
    private volatile String lastAttempt, lastCompleted;
    public ScrapedMenuRefreshService(ScraperAiClient ai, JsonMapper mapper, ScrapedMenuStore store,
            @Value("${app.scraper.enabled:true}") boolean enabled,
            @Value("${app.scraper.snapshot-file:./data/scraped-menus.json}") String file) throws java.io.IOException {
        this.ai=ai; this.mapper=mapper; this.store=store; this.enabled=enabled; this.file=Path.of(file).toAbsolutePath();
        this.locations=mapper.readTree(new ClassPathResource("mensa/scraper-locations.json").getContentAsString(StandardCharsets.UTF_8));
        var storedEntries=store.all();
        JsonNode metadata=store.get("__meta");
        if(metadata!=null) { lastCompleted=metadata.path("lastCompleted").asText(null); lastAttempt=metadata.path("lastAttempt").asText(null); }
        if(storedEntries.stream().noneMatch(entry -> !entry.path("id").asText().equals("__meta")) && Files.isRegularFile(this.file)) {
            try {
                JsonNode stored=mapper.readTree(Files.readString(this.file));
                for(JsonNode entry:stored.path("cafeterias")) store.save(entry);
                lastCompleted=stored.path("lastCompleted").asText(null);
                persist();
            } catch(RuntimeException | java.io.IOException ex) { System.err.println("Scraped menu snapshot unreadable; waiting for next refresh."); }
        }
    }
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        enqueueMissing();
        if(consoleEnabled) startConsoleListener();
    }
    /** Operator input only: type r and Enter in the backend's own terminal. */
    public boolean handleConsoleCommand(String command) {
        if(command==null || !command.strip().equalsIgnoreCase("r")) return false;
        String message=switch(requestRefresh()) {
            case STARTED -> "Scraper refresh started in the background.";
            case ALREADY_RUNNING -> "Scraper refresh is already running.";
            case DISABLED -> "Scraping is disabled; set MEAL_SCRAPER_ENABLED=true.";
            case NOT_CONFIGURED -> "Backend OpenAI key is missing or invalid.";
        };
        System.out.println(message);
        return true;
    }
    private synchronized void startConsoleListener() {
        if(consoleThread!=null || closed) return;
        consoleThread=new Thread(() -> {
            System.out.println("Scraper console: type r and Enter to refresh all configured cafeterias.");
            readConsoleCommands(new java.io.BufferedReader(new java.io.InputStreamReader(System.in,StandardCharsets.UTF_8)));
        },"scraper-console");
        consoleThread.setDaemon(true);
        consoleThread.start();
    }
    void readConsoleCommands(java.io.BufferedReader input) {
        // Do not close System.in; EOF ends the listener instead of spinning in detached processes.
        try {
            String line;
            while(!closed && (line=input.readLine())!=null) {
                if(closed) break;
                handleConsoleCommand(line);
            }
        } catch(java.io.IOException ignored) {
            if(!closed) System.err.println("Scraper console input is unavailable; use the manual refresh API.");
        }
    }
    @Scheduled(cron="${app.scraper.cron:0 0 6 * * *}",zone="Europe/Zurich")
    public void onSchedule() { enqueue(); }
    public void enqueue() {
        requestRefresh();
    }
    public enum RefreshStatus { STARTED, ALREADY_RUNNING, DISABLED, NOT_CONFIGURED }
    /** Force a full batch even when today's cached results are fresh. */
    public RefreshStatus requestRefresh() {
        if(!enabled) return RefreshStatus.DISABLED;
        if(!ai.configured()) return RefreshStatus.NOT_CONFIGURED;
        if(!running.compareAndSet(false,true)) return RefreshStatus.ALREADY_RUNNING;
        lastAttempt=Instant.now().toString();
        try { persist(); } catch(RuntimeException ex) { running.set(false); throw ex; }
        worker.submit(() -> {
            try { refresh(); }
            catch(RuntimeException ex) { System.err.println("Scraper batch failed before completion; check saved venue status and database availability."); }
            finally { running.set(false); }
        });
        return RefreshStatus.STARTED;
    }
    public void enqueueMissing() {
        if(!enabled || !ai.configured() || running.get()) return;
        var day=java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"));
        boolean missing=false;
        for(JsonNode venue:locations) if(!fresh(store.get(venue.path("id").asText()),day,venue)) { missing=true; break; }
        if(!missing) return;
        if(enabled && ai.configured() && running.compareAndSet(false,true)) worker.submit(() -> {
            try {
                lastAttempt=Instant.now().toString();
                var today=java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"));
                for(JsonNode venue:locations) {
                    String id=venue.path("id").asText();
                    if(!fresh(store.get(id),today,venue)) ensureMeals(id,today,today.plusDays(14));
                }
                lastCompleted=Instant.now().toString(); persist();
            } finally { running.set(false); }
        });
    }
    void refresh() {
        lastAttempt=Instant.now().toString();
        persist();
        System.out.println("Scraper batch started: " + lastAttempt + "; " + locations.size() + " cafeterias.");
        int completed=0;
        for(JsonNode venue:locations) {
            synchronized(locks.computeIfAbsent(venue.path("id").asText(), ignored -> new Object())) { refreshVenue(venue); }
            System.out.println("Scraper progress " + (++completed) + "/" + locations.size() + ": " + venue.path("name").asText());
        }
        lastCompleted=Instant.now().toString(); persist();
        System.out.println("Scraper batch completed: " + lastCompleted);
    }
    private void refreshVenue(JsonNode venue) {
            String id=venue.path("id").asText();
            var entry=mapper.createObjectNode();
            for(String field:java.util.List.of("id","name","url")) entry.set(field,venue.get(field));
            entry.put("lastAttempt",Instant.now().toString());
            try {
                if(!venue.path("url").isTextual()) {
                    entry.put("status","source_unavailable").put("error","No verified venue menu URL is configured.").put("stale",false);
                } else {
                    entry.set("result",ai.retrieve(venue.path("url").asText(), java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"))));
                    entry.put("updatedAt",Instant.now().toString()).put("stale",false);
                }
            } catch(RuntimeException ex) {
                // Provider/connector errors can contain credentials: expose and log only a fixed message.
                JsonNode previous=store.get(id);
                if(previous!=null && previous.has("result")) { entry.set("result",previous.get("result")); entry.set("updatedAt",previous.get("updatedAt")); }
                entry.put("stale",true).put("error","Refresh failed; check backend key, model and scraper connection.");
            }
            store.save(entry); // Raw evidence and meal projection commit together.
    }
    /** Database-first fallback. Cache empty/closed responses for today, failures for 15 minutes. */
    public void ensureMeals(String id, java.time.LocalDate start, java.time.LocalDate end) {
        var today=java.time.LocalDate.now(java.time.ZoneId.of("Europe/Zurich"));
        if(end.isBefore(today) || start.isAfter(today.plusDays(30))) return;
        start=start.isBefore(today) ? today : start;
        end=end.isAfter(today.plusDays(30)) ? today.plusDays(30) : end;
        for(JsonNode venue:locations) if(venue.path("id").asText().equals(id)) {
            synchronized(locks.computeIfAbsent(id,ignored -> new Object())) {
                JsonNode cached=store.get(id);
                if(!fresh(cached,today,venue) && enabled && ai.configured()) refreshVenue(venue);
                store.projectCached(id,start,end);
            }
            return;
        }
    }
    private static boolean fresh(JsonNode cached, java.time.LocalDate today, JsonNode venue) {
        if(cached==null || !cached.path("url").equals(venue.path("url"))) return false;
        try {
            Instant attempted=Instant.parse(cached.path("lastAttempt").asText());
            return cached.path("stale").asBoolean() ? attempted.isAfter(Instant.now().minusSeconds(900)) :
                attempted.atZone(java.time.ZoneId.of("Europe/Zurich")).toLocalDate().equals(today);
        } catch(RuntimeException ignored) { return false; }
    }
    public JsonNode snapshot() {
        var root=mapper.createObjectNode().put("enabled",enabled).put("configured",ai.configured()).put("running",running.get())
            .put("timeZone","Europe/Zurich").put("lastAttempt",lastAttempt).put("lastCompleted",lastCompleted);
        var cafeterias=mapper.createArrayNode();
        for(JsonNode venue:locations) {
            JsonNode entry=store.get(venue.path("id").asText());
            if(entry==null) { var pending=mapper.createObjectNode(); pending.setAll((tools.jackson.databind.node.ObjectNode)venue); pending.put("status","pending"); cafeterias.add(pending); }
            else cafeterias.add(entry);
        }
        root.set("cafeterias",cafeterias); return root;
    }
    private void persist() {
        store.save(mapper.createObjectNode().put("id","__meta").put("lastCompleted",lastCompleted).put("lastAttempt",lastAttempt));
    }
    @PreDestroy public void close() {
        closed=true;
        if(consoleThread!=null) consoleThread.interrupt();
        worker.shutdownNow();
    }
}
