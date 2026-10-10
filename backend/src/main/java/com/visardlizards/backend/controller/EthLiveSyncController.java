package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.repository.EthLiveMealImporter;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/eth/sync")
@ConditionalOnProperty(name = "app.internal-api.enabled", havingValue = "true")
@Tag(name = "ETH Live Sync", description = "Imports live meal rotas from the ETH Cookpit API into the mensa database")
public class EthLiveSyncController {

    private final EthLiveMealImporter liveMealImporter;
    private final Clock clock;

    public EthLiveSyncController(EthLiveMealImporter liveMealImporter, Clock clock) {
        this.liveMealImporter = liveMealImporter;
        this.clock = clock;
    }

    @PostMapping
    @Operation(summary = "Import live ETH meals for a specific week", description = "Fetches live meals from the ETH Cookpit API for the week containing the specified date, mapping and saving them to the database.")
    @ApiResponse(responseCode = "200", description = "Live meals imported successfully")
    public ResponseEntity<Map<String, Object>> syncMealsForDate(
            @Parameter(description = "Date in the desired week (defaults to today in Zurich)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate date) {
        LocalDate target = date != null ? date : LocalDate.now(clock);
        int count = liveMealImporter.importLiveEthMeals(target);
        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "importedMeals", count,
                "targetDate", target.toString()
        ));
    }

    @PostMapping("/upcoming")
    @Operation(summary = "Import live ETH meals for current and next week", description = "Fetches and persists live ETH menus for both the current and subsequent weeks.")
    @ApiResponse(responseCode = "200", description = "Upcoming live meals imported successfully")
    public ResponseEntity<Map<String, Object>> syncUpcoming() {
        LocalDate today = LocalDate.now(clock);
        LocalDate nextWeek = today.plusWeeks(1);
        int currentCount = liveMealImporter.importLiveEthMeals(today);
        int nextCount = liveMealImporter.importLiveEthMeals(nextWeek);
        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "currentWeekImported", currentCount,
                "nextWeekImported", nextCount,
                "totalImported", currentCount + nextCount
        ));
    }
}
