package com.visardlizards.backend.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import com.visardlizards.backend.service.ScrapedMenuRefreshService;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/scraped-menus")
public class ScrapedMenuController {
    private final ScrapedMenuRefreshService refresh;
    public ScrapedMenuController(ScrapedMenuRefreshService refresh) { this.refresh=refresh; }
    @GetMapping public ResponseEntity<JsonNode> all() {
        refresh.enqueueMissing(); // Database hits and today's empty/closed results do not call OpenAI again.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(refresh.snapshot());
    }
}
