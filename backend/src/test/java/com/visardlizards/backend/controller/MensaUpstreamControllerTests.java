package com.visardlizards.backend.controller;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClientException;

import com.visardlizards.backend.service.EthMensaClient;
import com.visardlizards.backend.service.ZfvMensaClient;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = MensaUpstreamController.class, properties = "mensa.upstream.enabled=true")
class MensaUpstreamControllerTests {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private EthMensaClient ethClient;

    @MockitoBean
    private ZfvMensaClient zfvClient;

    @Test
    void ethResponseIsRawJsonRatherThanAQuotedJsonString() throws Exception {
        String raw = "{\"weekly-rota-array\":[{\"unknown-field\":42}]}";
        when(ethClient.fetchWeeklyRotas(LocalDate.of(2026, 10, 9), "en", 0, 50)).thenReturn(raw);

        mvc.perform(get("/api/upstream/eth/weekly-rotas").param("date", "2026-10-09"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().string(raw));
    }

    @Test
    void upstreamExceptionIsReportedWithoutLeakingItsResponse() throws Exception {
        when(zfvClient.fetchThisWeek()).thenThrow(new RestClientException("private upstream diagnostics"));

        mvc.perform(get("/api/upstream/uzh/week"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.status").value(502))
                .andExpect(jsonPath("$.detail").value("The meal data provider could not complete the request."));
    }

    @Test
    void missingKeyIsReportedAsConfigurationIssue() throws Exception {
        when(zfvClient.fetchThisWeek()).thenThrow(new IllegalStateException("missing key"));

        mvc.perform(get("/api/upstream/uzh/week"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503));
    }

    @Test
    void emptyUpstreamBodyIsNotReturnedAsSuccessfulJson() throws Exception {
        when(zfvClient.fetchThisWeek()).thenReturn(null);

        mvc.perform(get("/api/upstream/uzh/week"))
                .andExpect(status().isBadGateway());
    }
}
