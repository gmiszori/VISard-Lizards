package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

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
        return fetchWeeklyRotas(date, language, 0, 50);
    }

    /** Retrieves a single raw page; rs-first is a zero-based row offset. */
    public String fetchWeeklyRotas(LocalDate date, String language, int offset, int pageSize) {
        Objects.requireNonNull(date, "date must not be null");
        Objects.requireNonNull(language, "language must not be null");
        String lang = language.toLowerCase(Locale.ROOT);
        if (!lang.equals("de") && !lang.equals("en")) {
            throw new IllegalArgumentException("language must be de or en");
        }
        if (offset < 0 || pageSize < 1 || pageSize > 50) {
            throw new IllegalArgumentException("offset must be nonnegative and pageSize between 1 and 50");
        }

        LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return client.get()
                .uri(ENDPOINT + "?client-id=ethz-wcms&lang={language}"
                        + "&rs-first={offset}&rs-size={pageSize}&valid-after={monday}",
                        lang, offset, pageSize, monday)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(String.class);
    }

    /**
     * Retrieves every page as raw JSON strings without merging or mapping them.
     * Only the array length is inspected to determine when pagination finishes.
     * Fails rather than silently truncating if the API repeats a full page or
     * exceeds the safety limit of 100 pages.
     */
    public List<String> fetchWeeklyRotaPages(LocalDate date, String language) {
        List<String> pages = new ArrayList<>();
        Set<String> seenPages = new HashSet<>();
        JsonMapper mapper = JsonMapper.builder().build();
        for (int page = 0; page < 100; page++) {
            String json = fetchWeeklyRotas(date, language, page * 50, 50);
            if (json == null || json.isBlank()) {
                throw new IllegalStateException("ETH returned an empty response during pagination");
            }
            var rotas = mapper.readTree(json).path("weekly-rota-array");
            if (!rotas.isArray()) {
                throw new IllegalStateException("ETH response has no weekly-rota-array");
            }
            if (rotas.size() > 50) {
                throw new IllegalStateException("ETH returned more entries than the requested page size");
            }
            if (!seenPages.add(json)) {
                throw new IllegalStateException("ETH repeated a page; pagination may be ignored");
            }
            pages.add(json);
            if (rotas.size() < 50) {
                return List.copyOf(pages);
            }
        }
        throw new IllegalStateException("ETH pagination exceeded 100 pages");
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
