package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.controller.MensaDtoMapper;
import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.Price;
import com.visardlizards.backend.model.domain.PriceCategory;
import com.visardlizards.backend.model.dto.HybridMealSearchRequest;
import com.visardlizards.backend.model.dto.HybridMealSearchResponse;
import com.visardlizards.backend.model.dto.SearchCriteria;
import com.visardlizards.backend.repository.HybridMealRepository;
import com.visardlizards.backend.repository.MensaRepository;

@Service
public class HybridMealSearchService {
    private final HybridIntentParser parser;
    private final HybridMealRepository repository;
    private final EmbeddingClient embeddingClient;
    private final MealEmbeddingService embeddings;
    private final MensaRepository mensas;
    private final MensaDtoMapper mapper;
    private final MensaService mensaService;
    private final Clock clock;

    public HybridMealSearchService(HybridIntentParser parser, HybridMealRepository repository,
            EmbeddingClient embeddingClient, MealEmbeddingService embeddings, MensaRepository mensas,
            MensaDtoMapper mapper, MensaService mensaService, Clock clock) {
        this.parser = parser;
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.embeddings = embeddings;
        this.mensas = mensas;
        this.mapper = mapper;
        this.mensaService = mensaService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public HybridMealSearchResponse search(HybridMealSearchRequest request) {
        PriceCategory category = request.priceCategory() == null ? PriceCategory.STUDENT : request.priceCategory();
        String priceColumn = switch (category) {
            case STUDENT -> "priceStudent";
            case STAFF -> "priceStaff";
            case EXTERNAL -> "priceExternal";
        };
        SearchCriteria criteria = request.criteria() == null
                ? parser.parse(request.query(), request.mensaId(), request.campusId(), priceColumn,
                        request.appLanguage())
                : parser.normalizeRealtimeCriteria(request.criteria(), request.mensaId());
        if (request.criteria() != null) validateRealtimeCriteria(criteria);
        return searchWithCriteria(request, criteria);
    }

    private void validateRealtimeCriteria(SearchCriteria criteria) {
        SearchCriteria.HardFilters filters = criteria.hardFilters();
        requireAllowed(filters.mensaId(), repository.mensaIds(), "mensaId");
        requireAllowed(filters.campusId(), repository.campusIds(), "campusId");
        requireAllowed(filters.dietTag(), repository.values("dietTag"), "dietTag");
        requireAllowed(filters.kind(), repository.values("kind"), "kind");
        requireAllowed(filters.service(), repository.values("service"), "service");
        List<String> allergens = repository.allergenValues();
        if (filters.excludeAllergens().stream().anyMatch(allergen -> !allergens.contains(allergen)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown allergen filter");
    }

    private static void requireAllowed(String value, List<String> allowed, String field) {
        if (value != null && !allowed.contains(value))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown " + field + " filter");
    }

    /** Package-visible execution seam for deterministic tests of the repository and ranking. */
    HybridMealSearchResponse searchWithCriteria(HybridMealSearchRequest request, SearchCriteria criteria) {
        PriceCategory category = request.priceCategory() == null ? PriceCategory.STUDENT : request.priceCategory();
        if (criteria.isLocationScoped() && (request.mensaId() == null || request.mensaId().isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location-scoped search requires mensaId context");
        if (criteria.sortBy() == SearchCriteria.SortBy.DISTANCE_ASC
                && (request.userLat() == null || request.userLng() == null))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Distance sort requires user coordinates");
        LocalDate requestedDate = request.date();
        LocalDate filterDate = criteria.hardFilters().date();
        if (requestedDate != null && filterDate != null && !requestedDate.equals(filterDate))
            return new HybridMealSearchResponse(criteria, 0, List.of());
        LocalDate date = filterDate != null ? filterDate
                : requestedDate != null ? requestedDate : mensaService.getMenuDate(LocalDate.now(clock));
        List<String> requestedCampusIds = request.campusIds();
        List<MealEntity> candidates = repository.candidates(date,
                criteria.isLocationScoped() ? request.mensaId() : null,
                requestedCampusIds == null ? request.campusId() : null,
                requestedCampusIds, criteria.hardFilters()).stream()
                .filter(m -> m.getTitle() != null && !m.getTitle().isBlank()
                        && !"novalue".equalsIgnoreCase(m.getTitle()))
                .toList();
        double[] queryVector = null;
        if (criteria.semanticQuery() != null && !criteria.semanticQuery().isBlank()) {
            queryVector = embeddingClient.embed(List.of(criteria.semanticQuery())).getFirst();
        }
        Map<String, Mensa> venues = mensas.findAllMensas().stream()
                .collect(Collectors.toMap(Mensa::id, Function.identity(), (a, b) -> a));
        double[] vector = queryVector;
        String semanticQuery = criteria.semanticQuery();
        List<Ranked> ranked = candidates.stream().map(meal -> rank(meal, venues.get(meal.getMensaId()),
                category, request.userLat(), request.userLng(), vector, semanticQuery))
                .sorted(order(criteria.sortBy(), vector != null)).toList();
        int limit = request.limit() == null ? 10 : Math.min(100, request.limit());
        if (limit < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be positive");
        List<HybridMealSearchResponse.Result> results = ranked.stream().limit(limit)
                .map(r -> new HybridMealSearchResponse.Result(r.meal.getMensaId(),
                        r.venue == null ? r.meal.getMensaId() : r.venue.name(), r.meal.getDate(),
                        mapper.toMealDTO(toDomain(r.meal), category), r.similarity, r.distanceM))
                .toList();
        return new HybridMealSearchResponse(criteria, ranked.size(), results);
    }

    private Ranked rank(MealEntity meal, Mensa venue, PriceCategory category, Double lat, Double lng,
            double[] queryVector, String semanticQuery) {
        Double similarity = null;
        if (queryVector != null && meal.getSemanticEmbedding() != null) {
            double score = MealEmbeddingService.cosine(queryVector, embeddings.decode(meal.getSemanticEmbedding()));
            if (Double.isFinite(score)) similarity = score;
        }
        Double distance = lat != null && lng != null && venue != null && venue.coordinates() != null
                ? StructuredMealSearchService.calculateDistanceM(lat, lng,
                        venue.coordinates().lat(), venue.coordinates().lng()) : null;
        BigDecimal price = switch (category) {
            case STUDENT -> meal.getPriceStudent();
            case STAFF -> meal.getPriceStaff();
            case EXTERNAL -> meal.getPriceExternal();
        };
        int matchingTerms = queryVector == null ? 0 : matchingTerms(meal, semanticQuery);
        return new Ranked(meal, venue, similarity, distance, price, matchingTerms);
    }

    /** Exact words provide a precision signal for embeddings on short or typo-corrected queries. */
    private static int matchingTerms(MealEntity meal, String query) {
        if (query == null || query.isBlank()) return 0;
        String description = (meal.getTitle() + " " + meal.getLine() + " " + String.join(" ", meal.getComponents()))
                .toLowerCase(java.util.Locale.ROOT);
        return (int) java.util.Arrays.stream(query.toLowerCase(java.util.Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(term -> term.length() >= 3)
                .distinct()
                .filter(term -> java.util.regex.Pattern.compile("(?<![\\p{L}\\p{N}])"
                        + java.util.regex.Pattern.quote(term) + "(?![\\p{L}\\p{N}])")
                        .matcher(description).find())
                .count();
    }

    private static Comparator<Ranked> order(SearchCriteria.SortBy sortBy, boolean semantic) {
        Comparator<Ranked> secondary = switch (sortBy) {
            case PRICE_ASC -> Comparator.comparing((Ranked r) -> r.price, Comparator.nullsLast(Comparator.naturalOrder()));
            case PRICE_DESC -> Comparator.comparing((Ranked r) -> r.price, Comparator.nullsLast(Comparator.reverseOrder()));
            case DISTANCE_ASC -> Comparator.comparing((Ranked r) -> r.distanceM, Comparator.nullsLast(Comparator.naturalOrder()));
            case RELEVANCE -> Comparator.comparing((Ranked r) -> r.meal.getId());
        };
        Comparator<Ranked> result = semantic
                ? Comparator.comparingInt((Ranked r) -> r.matchingTerms).reversed()
                    .thenComparing((Ranked r) -> r.similarity, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(secondary)
                : secondary;
        return result.thenComparing(r -> r.meal.getId());
    }

    private static Meal toDomain(MealEntity e) {
        Price price = e.getPriceStudent() == null && e.getPriceStaff() == null && e.getPriceExternal() == null
                ? null : new Price(e.getPriceStudent(), e.getPriceStaff(), e.getPriceExternal());
        return new Meal(e.getId(), e.getMensaId(), e.getDate(), e.getService(), e.getLine(), e.getKind(),
                e.getTitle(), List.copyOf(e.getComponents()), e.getDietTag(), price,
                List.copyOf(e.getAllergens()), e.getEcoScore(), e.getClimateImpact());
    }

    private record Ranked(MealEntity meal, Mensa venue, Double similarity, Double distanceM, BigDecimal price,
            int matchingTerms) { }
}
