package com.visardlizards.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.visardlizards.backend.service.AiSearchService;
import com.visardlizards.backend.service.AiSearchService.Candidate;

@RestController
@RequestMapping("/api/search")
public class AiSearchController {
    private final AiSearchService search;

    public AiSearchController(AiSearchService search) {
        this.search = search;
    }

    @PostMapping
    public SearchResponse search(@RequestBody SearchRequest request) {
        if (request == null || request.query() == null || request.query().isBlank()
                || request.query().length() > 200 || request.candidates() == null
                || request.candidates().isEmpty() || request.candidates().size() > 100
                || request.candidates().stream().anyMatch(c -> c == null || invalid(c.id(), 100)
                        || invalid(c.name(), 200) || invalid(c.campus(), 200)
                        || invalid(c.menu(), 4000) || invalid(c.diets(), 1000))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid search query or canteens");
        }
        return new SearchResponse(search.match(request.query().trim(), request.candidates()));
    }

    private static boolean invalid(String text, int limit) {
        return text == null || text.length() > limit;
    }

    public record SearchRequest(String query, List<Candidate> candidates) {}
    public record SearchResponse(List<String> ids) {}
}
