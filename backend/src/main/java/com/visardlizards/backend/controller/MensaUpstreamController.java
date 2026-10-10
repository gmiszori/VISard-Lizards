package com.visardlizards.backend.controller;

import java.time.LocalDate;
import java.net.http.HttpTimeoutException;
import java.net.SocketTimeoutException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;

import com.visardlizards.backend.service.EthMensaClient;
import com.visardlizards.backend.service.MensaLocationCatalog;
import com.visardlizards.backend.service.ZfvMensaClient;

/** Optional raw JSON endpoints for inspecting upstream data before DTO mapping. */
@RestController
@RequestMapping("/api/upstream")
@ConditionalOnProperty(name = "mensa.upstream.enabled", havingValue = "true")
public class MensaUpstreamController {

    private final EthMensaClient ethClient;
    private final ZfvMensaClient zfvClient;
    private final MensaLocationCatalog locationCatalog;

    public MensaUpstreamController(EthMensaClient ethClient, ZfvMensaClient zfvClient,
            MensaLocationCatalog locationCatalog) {
        this.ethClient = ethClient;
        this.zfvClient = zfvClient;
        this.locationCatalog = locationCatalog;
    }

    @GetMapping(value = "/eth/locations", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> ethLocations() {
        return rawJson(locationCatalog.readEthLocations());
    }

    @GetMapping(value = "/uzh/locations", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> uzhLocations() {
        return rawJson(locationCatalog.readUzhZfvLocations());
    }

    @GetMapping(value = "/eth/weekly-rotas", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> ethWeeklyRotas(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "en") String language,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "50") int pageSize) {
        return rawJson(ethClient.fetchWeeklyRotas(date, language, offset, pageSize));
    }

    @GetMapping(value = "/uzh/week", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> uzhWeek(@RequestParam(defaultValue = "false") boolean next) {
        return rawJson(next ? zfvClient.fetchNextWeek() : zfvClient.fetchThisWeek());
    }

    @GetMapping(value = "/eth/facilities/{facilityId}/weekly-rotas", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> ethFacilityWeeklyRotas(
            @PathVariable int facilityId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "en") String language) {
        return rawJson(ethClient.fetchFacilityWeeklyRotas(facilityId, date, language));
    }

    @GetMapping(value = "/uzh/day", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> uzhDay(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return rawJson(zfvClient.fetchDay(date));
    }

    @ExceptionHandler(RestClientException.class)
    public ProblemDetail upstreamUnavailable(RestClientException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof HttpTimeoutException || cause instanceof SocketTimeoutException) {
                return ProblemDetail.forStatusAndDetail(HttpStatus.GATEWAY_TIMEOUT,
                        "The meal data provider timed out.");
            }
        }
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY,
                "The meal data provider could not complete the request.");
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail upstreamNotConfigured(IllegalStateException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "The upstream client is not configured. Configure MENSA_ZFV_API_KEY for UZH requests.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail invalidRequest(IllegalArgumentException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    private static ResponseEntity<String> rawJson(String body) {
        if (body == null || body.isBlank()) {
            throw new RestClientException("Upstream returned an empty body");
        }
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
