package com.visardlizards.backend.service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MensaClientsTests {

    @Test
    void ethRetrievesSecondPageWithoutMappingOrDroppingFields() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        EthMensaClient client = new EthMensaClient(builder.build());
        String first = "{\"weekly-rota-array\":[" + IntStream.range(0, 50)
                .mapToObj(i -> "{\"facility-id\":" + i + "}")
                .collect(Collectors.joining(",")) + "],\"extra\":true}";
        String second = "{\"weekly-rota-array\":[{\"facility-id\":100}],\"extra\":true}";
        String prefix = "https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas"
                + "?client-id=ethz-wcms&lang=de&rs-first=";
        server.expect(requestTo(prefix + "0&rs-size=50&valid-after=2026-10-05"))
                .andRespond(withSuccess(first, MediaType.APPLICATION_JSON));
        server.expect(requestTo(prefix + "50&rs-size=50&valid-after=2026-10-05"))
                .andRespond(withSuccess(second, MediaType.APPLICATION_JSON));

        assertEquals(List.of(first, second), client.fetchWeeklyRotaPages(LocalDate.of(2026, 10, 9), "de"));
        server.verify();
    }

    @Test
    void ethRejectsMalformedPaginationResponseInsteadOfLosingMenus() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        EthMensaClient client = new EthMensaClient(builder.build());
        server.expect(requestTo("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas"
                        + "?client-id=ethz-wcms&lang=en&rs-first=0&rs-size=50&valid-after=2026-10-05"))
                .andRespond(withSuccess("{\"error\":\"unavailable\"}", MediaType.APPLICATION_JSON));

        assertThrows(IllegalStateException.class,
                () -> client.fetchWeeklyRotaPages(LocalDate.of(2026, 10, 9), "en"));
        server.verify();
    }

    @Test
    void ethUsesMondayAcrossYearBoundaryAndPreservesUnknownFields() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        EthMensaClient client = new EthMensaClient(builder.build());
        String json = "{\"weekly-rota-array\":[],\"future-field\":{\"value\":42}}";

        server.expect(requestTo("https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas"
                        + "?client-id=ethz-wcms&lang=en&rs-first=0&rs-size=50&valid-after=2025-12-29"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        assertEquals(json, client.fetchWeeklyRotas(LocalDate.of(2026, 1, 4), "EN"));
        server.verify();
    }

    @Test
    void uzhEscapesLocationVariableAndPreservesGraphqlErrors() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        UzhMensaClient client = new UzhMensaClient(builder.build());
        String locationId = "location\"\\\nZürich";
        String json = "{\"data\":null,\"errors\":[{\"message\":\"Unknown location\"}]}";

        server.expect(requestTo("https://api.app.food2050.ch/"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(request -> {
                    MockClientHttpRequest mockRequest = (MockClientHttpRequest) request;
                    var body = JsonMapper.builder().build().readTree(
                            mockRequest.getBodyAsString(StandardCharsets.UTF_8));
                    assertEquals(locationId, body.path("variables").path("locationId").asText());
                    assertEquals("ExampleQuery", body.path("operationName").asText());
                    assertEquals(MediaType.APPLICATION_JSON, request.getHeaders().getContentType());
                })
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        assertEquals(json, client.fetchTodayOffers(locationId));
        server.verify();
    }

    @Test
    void upstreamHttpFailureIsReportedInsteadOfReturningEmptyMenus() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        UzhMensaClient client = new UzhMensaClient(builder.build());

        server.expect(requestTo("https://api.app.food2050.ch/"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        RestClientResponseException error = assertThrows(RestClientResponseException.class,
                () -> client.fetchTodayOffers("some-location"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
        server.verify();
    }
}
