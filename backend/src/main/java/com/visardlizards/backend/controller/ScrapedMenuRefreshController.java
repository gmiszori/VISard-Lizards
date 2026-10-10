package com.visardlizards.backend.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.visardlizards.backend.service.ScrapedMenuRefreshService;

/** Server-admin refresh; never permits anonymous requests to spend the OpenAI key. */
@RestController
@RequestMapping("/api/scraped-menus")
public class ScrapedMenuRefreshController {
    private final ScrapedMenuRefreshService refresh;
    private final String token;
    public ScrapedMenuRefreshController(ScrapedMenuRefreshService refresh,
            @Value("${app.scraper.connector-token:}") String token) {
        this.refresh=refresh; this.token=token;
    }
    @PostMapping("/refresh")
    public ResponseEntity<Map<String,String>> refresh(
            @RequestHeader(value="Authorization",required=false) String authorization) {
        if(token.length()<32 || authorization==null || !MessageDigest.isEqual(
                ("Bearer " + token).getBytes(StandardCharsets.UTF_8), authorization.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(401).body(Map.of("status","unauthorized"));
        }
        var status=refresh.requestRefresh();
        int code=switch(status) {
            case STARTED -> 202;
            case ALREADY_RUNNING -> 409;
            case DISABLED, NOT_CONFIGURED -> 503;
        };
        return ResponseEntity.status(code).body(Map.of("status",status.name().toLowerCase(java.util.Locale.ROOT)));
    }
}
