package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Raw UZH menu retrieval using the maintained MensaZH app's ZFV request (MIT).
 * Requires a caller-provided API key; no credentials are embedded in the code.
 */
@Service
public class ZfvMensaClient {

    private static final String ENDPOINT = "https://api.zfv.ch/graphql";
    private static final String DAY_FIELDS = """
            date { weekdayNumber }
            menuItems {
              prices { amount }
              ... on OutletMenuItemDish {
                category { name path }
                dish {
                  name_i18n { label locale }
                  stats {
                    energy { amount }
                    fat { amount }
                    carbohydrates { amount }
                    sugar { amount }
                    fibers { amount }
                    protein { amount }
                    salt { amount }
                  }
                  allergens { allergen { name } }
                  media { media { url } }
                  isVegetarian isVegan
                }
              }
            }
            """;

    private final RestClient client;
    private final String apiKey;

    @Autowired
    public ZfvMensaClient(@Value("${mensa.zfv.api-key:${MENSA_ZFV_API_KEY:}}") String apiKey) {
        this(createClient(), apiKey);
    }

    ZfvMensaClient(RestClient client, String apiKey) {
        this.client = Objects.requireNonNull(client);
        this.apiKey = apiKey;
    }

    public String fetchThisWeek() {
        return fetchCalendar("week { daily { " + DAY_FIELDS + " } }");
    }

    public String fetchNextWeek() {
        return fetchCalendar("week(week: \"next\") { daily { " + DAY_FIELDS + " } }");
    }

    /** Returns all outlets for the requested day, preserving the GraphQL envelope. */
    public String fetchDay(LocalDate date) {
        Objects.requireNonNull(date, "date must not be null");
        return fetchCalendar("day(date: \"" + date + "\") { " + DAY_FIELDS + " }");
    }

    private String fetchCalendar(String calendarQuery) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "Configure MENSA_ZFV_API_KEY or mensa.zfv.api-key before requesting UZH menus");
        }
        String query = "query Client { organisation(where: {"
                + "id: \"cm1tjaby3002o72q4lhhak996\", tenantId: \"zfv\"}) {"
                + " outlets(take: 100) { slug calendar { " + calendarQuery + " } } } }";

        return client.post()
                .uri(ENDPOINT)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .header("api-key", apiKey)
                .body(Map.of("query", query, "operationName", "Client"))
                .retrieve()
                .body(String.class);
    }

    private static RestClient createClient() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(30));
        return RestClient.builder().requestFactory(factory).build();
    }
}
