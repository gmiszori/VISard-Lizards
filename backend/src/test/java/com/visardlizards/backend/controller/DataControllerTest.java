package com.visardlizards.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.internal-api.enabled=true")
@AutoConfigureMockMvc
class DataControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void testGetHealthEndpoint() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.activeCaches").isArray());
    }

    @Test
    void testCreateAndGetDataRecord() throws Exception {
        String jsonPayload = """
                {
                    "dataKey": "controller-test-key",
                    "content": "test payload"
                }
                """;

        mockMvc.perform(post("/api/data")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataKey").value("controller-test-key"))
                .andExpect(jsonPath("$.content").value("test payload"));

        mockMvc.perform(get("/api/data/key/controller-test-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataKey").value("controller-test-key"));
    }

    @Test
    void testCacheStatsEndpoint() throws Exception {
        mockMvc.perform(get("/api/cache/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estimatedSize").exists());
    }

    @Test
    void testSearchEndpoint() throws Exception {
        mockMvc.perform(get("/api/data/search?q=info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void testBatchCreateEndpoint() throws Exception {
        String batchJson = """
                [
                    {"dataKey": "batch-1", "content": "alpha"},
                    {"dataKey": "batch-2", "content": "beta"}
                ]
                """;

        mockMvc.perform(post("/api/data/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(batchJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }
}
