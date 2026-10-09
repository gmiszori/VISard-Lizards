package com.visardlizards.backend.service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ZfvMensaClientTests {

    @Test
    void requestsWeekWithConfiguredKeyAndPreservesGraphqlEnvelope() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ZfvMensaClient client = new ZfvMensaClient(builder.build(), "test-key");
        String json = "{\"data\":null,\"errors\":[{\"message\":\"Not authorized\"}]}";
        server.expect(requestTo("https://api.zfv.ch/graphql"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("api-key", "test-key"))
                .andExpect(request -> {
                    var body = JsonMapper.builder().build().readTree(
                            ((MockClientHttpRequest) request).getBodyAsString(StandardCharsets.UTF_8));
                    assertEquals("Client", body.path("operationName").asText());
                    assertTrue(body.path("query").asText().contains("week { daily"));
                    assertTrue(body.path("query").asText().contains("name_i18n"));
                })
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        assertEquals(json, client.fetchThisWeek());
        server.verify();
    }

    @Test
    void dayQueryUsesRequestedDate() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ZfvMensaClient client = new ZfvMensaClient(builder.build(), "test-key");
        server.expect(requestTo("https://api.zfv.ch/graphql"))
                .andExpect(request -> {
                    var body = JsonMapper.builder().build().readTree(
                            ((MockClientHttpRequest) request).getBodyAsString(StandardCharsets.UTF_8));
                    assertTrue(body.path("query").asText().contains("day(date: \"2026-10-12\")"));
                })
                .andRespond(withSuccess("{\"data\":{}}", MediaType.APPLICATION_JSON));

        assertEquals("{\"data\":{}}", client.fetchDay(LocalDate.of(2026, 10, 12)));
        server.verify();
    }

    @Test
    void missingKeyFailsBeforeAnyNetworkRequest() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ZfvMensaClient client = new ZfvMensaClient(builder.build(), "");

        assertThrows(IllegalStateException.class, client::fetchThisWeek);
        server.verify();
    }

    @Test
    void invalidKeyDoesNotLeakThroughHeaderValidationErrors() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ZfvMensaClient client = new ZfvMensaClient(builder.build(), "private-test-key\n");

        IllegalStateException error = assertThrows(IllegalStateException.class, client::fetchThisWeek);
        assertEquals("The ZFV API key contains invalid control characters", error.getMessage());
        server.verify();
    }
}
