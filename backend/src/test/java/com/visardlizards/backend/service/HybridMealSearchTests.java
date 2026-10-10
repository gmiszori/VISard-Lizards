package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.dto.HybridMealSearchRequest;
import com.visardlizards.backend.model.dto.HybridMealSearchResponse;
import com.visardlizards.backend.model.dto.SearchCriteria;

import jakarta.persistence.EntityManager;

@SpringBootTest
@TestPropertySource(locations = "classpath:config/application.properties", properties = "openai.api-key=")
@Import(HybridMealSearchTests.EmbeddingConfig.class)
@Transactional
class HybridMealSearchTests {
    private static final LocalDate DAY = LocalDate.of(2099, 1, 1);

    @Autowired EntityManager entityManager;
    @Autowired HybridMealSearchService search;
    @Autowired MealEmbeddingService embeddings;
    @Autowired FakeEmbeddingClient client;

    @BeforeEach
    void fixtures() {
        client.calls.set(0);
        persist("hybrid.vegan", "polyterrasse", "vegan", "Spicy tofu", "10.00", new double[]{1, 0}, List.of());
        persist("hybrid.meat", "polyterrasse", "meat", "Pork roast", "9.00", new double[]{0, 1}, List.of());
        persist("hybrid.allergen", "polyterrasse", "vegan", "Creamy tofu", "11.00", new double[]{0.7, 0.3}, List.of("Milk"));
        persist("hybrid.expensive", "archimedes", "vegan", "Tofu bowl", "20.00", new double[]{0.8, 0.2}, List.of());
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void hardConstraintsExcludeEveryMismatch() {
        var filters = new SearchCriteria.HardFilters(null, null, null, null, "vegan", null, null,
                new SearchCriteria.NumberBounds(null, new BigDecimal("15.00"), null, null),
                null, null, List.of("Milk"));
        var criteria = new SearchCriteria(null, false, filters, SearchCriteria.SortBy.PRICE_ASC);
        HybridMealSearchResponse result = search.searchWithCriteria(request(null), criteria);
        assertThat(result.results()).extracting(r -> r.meal().id()).containsExactly("hybrid.vegan");
        assertThat(client.calls.get()).isZero();
    }

    @Test
    void semanticRankingUsesStoredCosineVectors() {
        var criteria = new SearchCriteria("spicy tofu", false, null, SearchCriteria.SortBy.RELEVANCE);
        HybridMealSearchResponse result = search.searchWithCriteria(request(null), criteria);
        assertThat(result.results()).extracting(r -> r.meal().id())
                .containsExactly("hybrid.vegan", "hybrid.expensive", "hybrid.allergen", "hybrid.meat");
        assertThat(result.results()).allSatisfy(r -> assertThat(r.similarity()).isNotNull());
        assertThat(result.results().getFirst().similarity()).isEqualTo(1.0);
        assertThat(client.calls.get()).isEqualTo(1);
    }

    @Test
    void exactSemanticTermsBreakEmbeddingTiesInFavorOfDirectMatches() {
        persist("hybrid.chicken", "polyterrasse", "meat", "Chicken curry", "12.00",
                new double[]{0, 1}, List.of("chicken"));
        entityManager.flush();
        entityManager.clear();
        var criteria = new SearchCriteria("chicken", false, null, SearchCriteria.SortBy.RELEVANCE);
        HybridMealSearchResponse result = search.searchWithCriteria(request(null), criteria);
        assertThat(result.results().getFirst().meal().id()).isEqualTo("hybrid.chicken");
        assertThat(result.results().getFirst().similarity()).isEqualTo(0.0);
    }

    @Test
    void locationOnlyBrowsingNeverEmbedsQuery() {
        var criteria = new SearchCriteria(null, true, null, SearchCriteria.SortBy.RELEVANCE);
        HybridMealSearchResponse result = search.searchWithCriteria(request("polyterrasse"), criteria);
        assertThat(result.results()).extracting(HybridMealSearchResponse.Result::mensaId)
                .containsExactly("polyterrasse", "polyterrasse", "polyterrasse");
        assertThat(client.calls.get()).isZero();
    }

    @Test
    void locationIntentWithoutAnActiveVenueFallsBackInsteadOfFailing() {
        var criteria = new SearchCriteria("chicken", true, null, SearchCriteria.SortBy.RELEVANCE);

        SearchCriteria normalized = HybridIntentParser.normalizeLocationScope(criteria, null);

        assertThat(normalized.isLocationScoped()).isFalse();
        assertThat(normalized.semanticQuery()).isEqualTo("chicken");
    }

    @Test
    void gpsContextDoesNotScopePlainFoodQueryButExplicitHereDoes() {
        var filters = new SearchCriteria.HardFilters(null, null, "polyterrasse", null, "vegan", null, null,
                null, null, null, List.of());
        var parsed = new SearchCriteria(null, true, filters, SearchCriteria.SortBy.RELEVANCE);

        SearchCriteria plain = HybridIntentParser.normalizeLocationScope(
                parsed, "polyterrasse", "vegan", "Mensa Polyterrasse");
        SearchCriteria local = HybridIntentParser.normalizeLocationScope(
                parsed, "polyterrasse", "vegan here", "Mensa Polyterrasse");

        assertThat(plain.isLocationScoped()).isFalse();
        assertThat(plain.hardFilters().mensaId()).isNull();
        assertThat(local.isLocationScoped()).isTrue();
    }

    private HybridMealSearchRequest request(String mensaId) {
        return new HybridMealSearchRequest(null, mensaId, null, DAY, null,
                null, null, 10);
    }

    private void persist(String id, String mensaId, String diet, String title, String price,
            double[] vector, List<String> allergens) {
        MealEntity meal = new MealEntity(id, mensaId, DAY, "lunch", "Daily", "main", title,
                diet, new BigDecimal(price), null, null, null, null, List.of(title), allergens);
        meal.setSemanticEmbedding(embeddings.encode(vector));
        entityManager.persist(meal);
    }

    @TestConfiguration
    static class EmbeddingConfig {
        @Bean @Primary FakeEmbeddingClient fakeEmbeddingClient() { return new FakeEmbeddingClient(); }
    }

    static class FakeEmbeddingClient implements EmbeddingClient {
        final AtomicInteger calls = new AtomicInteger();
        @Override public boolean available() { return false; }
        @Override public List<double[]> embed(List<String> inputs) {
            calls.incrementAndGet();
            return inputs.stream().map(ignored -> new double[]{1, 0}).toList();
        }
    }
}
