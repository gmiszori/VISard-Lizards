package com.visardlizards.backend.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Short HTTP requests around long MCP calls; jobs and credentials are never persisted. */
@Service
public class RoutePlannerJobs {
    private final JsonMapper mapper;
    private final Semaphore available = new Semaphore(1);
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        var thread = new Thread(r, "route-planner-jobs"); thread.setDaemon(true); return thread;
    });
    private final Cache<String, JsonNode> jobs = Caffeine.newBuilder()
        .maximumSize(32).expireAfterWrite(Duration.ofMinutes(30)).build();

    public RoutePlannerJobs(JsonMapper mapper) { this.mapper = mapper; }

    public JsonNode start(Supplier<JsonNode> action) {
        if (!available.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
            "Route planning or food research is already in progress. Try again shortly.");
        String id = UUID.randomUUID().toString();
        jobs.put(id, mapper.createObjectNode().put("status", "running"));
        try {
            worker.execute(() -> {
                JsonNode result;
                try {
                    result = mapper.createObjectNode().put("status", "completed").set("result", action.get());
                } catch (ResponseStatusException failure) {
                    result = mapper.createObjectNode().put("status", "failed")
                        .put("httpStatus", failure.getStatusCode().value())
                        .put("detail", failure.getReason() == null ? "Route request failed." : failure.getReason());
                } catch (RuntimeException failure) {
                    // Never include provider exception messages, which may contain credentials.
                    result = mapper.createObjectNode().put("status", "failed").put("httpStatus", 502)
                        .put("detail", "Route request failed. Check routing service availability and try again.");
                } finally { available.release(); }
                jobs.put(id, result);
            });
        } catch (RejectedExecutionException failure) {
            jobs.invalidate(id); available.release();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Route service is restarting.");
        }
        return mapper.createObjectNode().put("jobId", id);
    }

    public JsonNode status(String id) {
        var job = jobs.getIfPresent(id);
        if (job == null) throw new ResponseStatusException(HttpStatus.GONE,
            "This route request expired or the backend restarted. Please plan again.");
        return job;
    }

    @PreDestroy public void close() { worker.shutdownNow(); jobs.invalidateAll(); }
}
