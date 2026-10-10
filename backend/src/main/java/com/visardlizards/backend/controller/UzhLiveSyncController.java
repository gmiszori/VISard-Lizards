package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.repository.UzhLiveMealImporter;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/uzh/sync")
@Tag(name = "UZH Live Sync", description = "Live meal synchronization from Food2050 / UZH")
public class UzhLiveSyncController {

    private final UzhLiveMealImporter liveMealImporter;
    private final Clock clock;

    public UzhLiveSyncController(UzhLiveMealImporter liveMealImporter, Clock clock) {
        this.liveMealImporter = liveMealImporter;
        this.clock = clock;
    }

    @PostMapping
    @Operation(summary = "Import live UZH meals for today", description = "Fetches live meals from the Food2050 GraphQL API for all UZH locations, mapping and persisting them to the database.")
    public ResponseEntity<Map<String, Object>> syncToday(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate targetDate = (date != null) ? date : LocalDate.now(clock);
        int count = liveMealImporter.importTodayUzhMeals(targetDate);
        return ResponseEntity.ok(Map.of(
                "status", "success",
                "date", targetDate.toString(),
                "mealsImported", count
        ));
    }
}
