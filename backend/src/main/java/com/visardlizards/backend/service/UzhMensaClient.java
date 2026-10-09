package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Retrieves raw UZH FOOD2050 GraphQL JSON without creating menu DTOs.
 * Request adapted from famoser/Mensa's UZHMensaProvider2.kt (MIT).
 * Legacy endpoint returned HTTP 404 during verification on 2026-10-10.
 * For the maintained app's API, use ZfvMensaClient with your own API key.
 */
@Service
public class UzhMensaClient {

    private static final String ENDPOINT = "https://api.app.food2050.ch/";

    private static final String QUERY = """
            query ExampleQuery($locationId: String!) {
              location(id: $locationId) {
                kitchens {
                  slug
                  todayOffer {
                    digitalMenuItems {
                      displayName
                      recipeSelectorConfig
                      recipe {
                        title(returnAll: true)
                        prices { amount category { title } }
                        allergensList
                      }
                    }
                  }
                }
              }
            }
            """;

    private final RestClient client;

    public UzhMensaClient() {
        this(RestClient.builder().requestFactory(requestFactory()).build());
    }

    UzhMensaClient(RestClient client) {
        this.client = client;
    }

    /**
     * Fetches today's offers for a FOOD2050 location ID (not a kitchen slug).
     * Returns the full GraphQL envelope, including any "errors" field.
     * HTTP/network errors propagate as Spring RestClientException subclasses.
     */
    public String fetchTodayOffers(String locationId) {
        if (locationId == null || locationId.isBlank()) {
            throw new IllegalArgumentException("locationId must not be blank");
        }

        // Let the JSON converter escape variables instead of interpolating them.
        Map<String, Object> request = Map.of(
                "query", QUERY,
                "variables", Map.of("locationId", locationId),
                "operationName", "ExampleQuery");

        return client.post()
                .uri(ENDPOINT)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(String.class);
    }

    private static JdkClientHttpRequestFactory requestFactory() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(30));
        return factory;
    }
}
