package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.Objects;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Retrieves raw ETH Cookpit JSON, leaving filtering and DTO mapping to the caller.
 * Request adapted from famoser/Mensa's ETHMensaProvider2.kt (MIT).
 */
@Service
public class EthMensaClient {

    private static final String ENDPOINT =
            "https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas";

    private final RestClient client;

    public EthMensaClient() {
        this(RestClient.builder().requestFactory(requestFactory()).build());
    }

    EthMensaClient(RestClient client) {
        this.client = client;
    }

    /**
     * Fetches the raw weekly response for the week containing {@code date}.
     * The upstream may return other weeks too; callers must filter the JSON.
     * HTTP/network errors propagate as Spring RestClientException subclasses.
     */
    public String fetchWeeklyRotas(LocalDate date, String language) {
        Objects.requireNonNull(date, "date must not be null");
        Objects.requireNonNull(language, "language must not be null");
        String lang = language.toLowerCase(Locale.ROOT);
        if (!lang.equals("de") && !lang.equals("en")) {
            throw new IllegalArgumentException("language must be de or en");
        }

        LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return client.get()
                .uri(ENDPOINT + "?client-id=ethz-wcms&lang={language}"
                        + "&rs-first=0&rs-size=50&valid-after={monday}", lang, monday)
                .accept(MediaType.APPLICATION_JSON)
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
