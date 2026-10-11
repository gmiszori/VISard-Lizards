package com.visardlizards.backend.controller;

import com.visardlizards.backend.service.RoutePlannerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;

@WebMvcTest(controllers = RoutePlannerController.class, properties = {
    "GOOGLE_MAPS_BROWSER_KEY=public-browser-key", "GOOGLE_MAPS_API_KEY=private-routing-secret"
})
class RoutePlannerMapConfigTests {
    @Autowired MockMvc mvc;
    @MockitoBean RoutePlannerService service;
    @MockitoBean com.visardlizards.backend.service.RoutePlannerJobs jobs;

    @Test void acceptsBackgroundPlanningAndProvidesUncachedPolling() throws Exception {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        org.mockito.Mockito.when(jobs.start(org.mockito.ArgumentMatchers.any()))
            .thenReturn(mapper.readTree("{\"jobId\":\"opaque-job\"}"));
        mvc.perform(post("/api/route-planner/plan/jobs").header("X-OpenAI-Key","request-secret")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("""
                {"origin":"Zürich HB","destination":"Enge","departureTime":"2026-10-12T09:00:00Z",
                 "arrivalTime":"2026-10-12T12:00:00Z","mealMinutes":5,"modes":["WALK"]}
                """))
            .andExpect(status().isAccepted()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.jobId").value("opaque-job"))
            .andExpect(content().string(not(containsString("request-secret"))));
        org.mockito.Mockito.verify(service).validate(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq("request-secret"));
        org.mockito.Mockito.verify(service,org.mockito.Mockito.never()).plan(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
        org.mockito.Mockito.when(jobs.status("opaque-job")).thenReturn(mapper.readTree("{\"status\":\"running\"}"));
        mvc.perform(get("/api/route-planner/jobs/opaque-job"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.status").value("running"));
    }

    @Test void exposesOnlyPublicDisplayKeyAndDisablesCaching() throws Exception {
        mvc.perform(get("/api/route-planner/map-config"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.provider").value("google"))
            .andExpect(jsonPath("$.browserKey").value("public-browser-key"))
            .andExpect(content().string(not(containsString("private-routing-secret"))));
    }
}
