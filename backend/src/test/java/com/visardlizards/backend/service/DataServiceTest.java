package com.visardlizards.backend.service;

import com.visardlizards.backend.config.CacheConfig;
import com.visardlizards.backend.model.domain.DataRecord;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class DataServiceTest {

    @Autowired
    private DataService dataService;

    @Autowired
    private CacheManager cacheManager;

    @Test
    void testSaveAndCachedRetrieval() {
        String testKey = "hackathon-test-key";
        String testContent = "Initial content";

        DataRecord saved = dataService.save(testKey, testContent);
        assertNotNull(saved);
        assertNotNull(saved.id());
        assertEquals(testKey, saved.dataKey());
        assertEquals(testContent, saved.content());

        // First retrieval populates the cache
        Optional<DataRecord> fetched = dataService.getById(saved.id());
        assertTrue(fetched.isPresent());
        assertEquals(testContent, fetched.get().content());

        // Verify it was stored in Caffeine cache
        Cache cache = cacheManager.getCache(CacheConfig.DATA_CACHE);
        assertNotNull(cache);
        assertNotNull(cache.get(saved.id()));

        // Delete should evict the cache
        dataService.deleteById(saved.id());
        assertNull(cache.get(saved.id()));
    }

    @Test
    void testSaveBlankKeyThrowsException() {
        assertThrows(IllegalArgumentException.class, () -> dataService.save("   ", "Some data"));
        assertThrows(IllegalArgumentException.class, () -> dataService.save(null, "Some data"));
    }
}
