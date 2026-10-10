package com.visardlizards.backend.controller;

import com.visardlizards.backend.service.RoutePlannerService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/route-planner")
public class RoutePlannerController {
    public record Trip(@NotBlank @Size(max=200) String origin, @NotBlank @Size(max=200) String destination,
                       @NotNull Instant departureTime, @NotNull Instant arrivalTime,
                       @Min(45) @Max(60) int mealMinutes) {}
    private final RoutePlannerService service;
    public RoutePlannerController(RoutePlannerService service) { this.service = service; }
    @GetMapping("/status")
    public ResponseEntity<JsonNode> status() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.status());
    }
    /** Public map metadata; OpenStreetMap needs no browser credential. */
    @GetMapping("/map-config")
    public ResponseEntity<java.util.Map<String,String>> mapConfig() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(java.util.Map.of("provider","openstreetmap"));
    }
    @PostMapping("/plan")
    public ResponseEntity<JsonNode> plan(@RequestHeader(name="X-OpenAI-Key", defaultValue="") String key,
                                        @Valid @RequestBody Trip trip) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.plan(trip, key));
    }
}
