package com.visardlizards.backend.controller;

import com.visardlizards.backend.service.RoutePlannerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;

@WebMvcTest(controllers = RoutePlannerController.class, properties = {
    "GOOGLE_MAPS_BROWSER_KEY=public-browser-key", "GOOGLE_MAPS_API_KEY=private-routing-secret"
})
class RoutePlannerMapConfigTests {
    @Autowired MockMvc mvc;
    @MockitoBean RoutePlannerService service;

    @Test void exposesOnlyBrowserCredentialAndDisablesCaching() throws Exception {
        mvc.perform(get("/api/route-planner/map-config"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.browserKey").value("public-browser-key"))
            .andExpect(jsonPath("$.mapId").value("DEMO_MAP_ID"))
            .andExpect(content().string(not(containsString("private-routing-secret"))));
    }
}
