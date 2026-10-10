package com.visardlizards.backend.controller;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.stats.CacheStats;
import com.visardlizards.backend.config.CacheConfig;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/cache")
@ConditionalOnProperty(name = "app.internal-api.enabled", havingValue = "true")
public class CacheManagementController {

    private final CacheManager cacheManager;

    public CacheManagementController(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        org.springframework.cache.Cache springCache = cacheManager.getCache(CacheConfig.DATA_CACHE);
        if (springCache instanceof CaffeineCache caffeineCache) {
            Cache<Object, Object> nativeCache = caffeineCache.getNativeCache();
            CacheStats stats = nativeCache.stats();
            return ResponseEntity.ok(Map.of(
                    "estimatedSize", nativeCache.estimatedSize(),
                    "hitCount", stats.hitCount(),
                    "missCount", stats.missCount(),
                    "hitRate", stats.hitRate(),
                    "evictionCount", stats.evictionCount(),
                    "loadSuccessCount", stats.loadSuccessCount()
            ));
        }

        return ResponseEntity.ok(Map.of(
                "status", "Active",
                "cacheName", CacheConfig.DATA_CACHE
        ));
    }

    @PostMapping("/clear")
    public ResponseEntity<Map<String, String>> clearCache() {
        org.springframework.cache.Cache springCache = cacheManager.getCache(CacheConfig.DATA_CACHE);
        if (springCache != null) {
            springCache.clear();
        }
        return ResponseEntity.ok(Map.of(
                "message", "Cache '" + CacheConfig.DATA_CACHE + "' cleared successfully"
        ));
    }
}
