package com.visardlizards.backend.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.dto.HybridMealSearchRequest;
import com.visardlizards.backend.model.dto.HybridMealSearchResponse;
import com.visardlizards.backend.service.HybridMealSearchService;

@RestController
public class HybridMealSearchController {
    private final HybridMealSearchService search;

    public HybridMealSearchController(HybridMealSearchService search) {
        this.search = search;
    }

    @PostMapping("/api/meals/hybrid-search")
    public HybridMealSearchResponse search(@RequestBody HybridMealSearchRequest request) {
        return search.search(request);
    }
}
