package com.visardlizards.backend.service;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.model.db.MealEntity;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class MealEmbeddingService {
    private static final Logger log = LoggerFactory.getLogger(MealEmbeddingService.class);
    private static final int BATCH_SIZE = 100;
    private final EmbeddingClient client;
    private final JsonMapper mapper;

    public MealEmbeddingService(EmbeddingClient client, JsonMapper mapper) {
        this.client = client;
        this.mapper = mapper;
    }

    public String descriptiveText(MealEntity meal) {
        return "Title: " + meal.getTitle() + "\nLine: " +
                (meal.getLine() == null ? "" : meal.getLine()) + "\nComponents: " +
                String.join(", ", meal.getComponents().stream()
                        .filter(c -> !c.startsWith("Source:")).toList());
    }

    /** Precomputes vectors before a newly imported or updated row is saved. */
    public void fill(List<MealEntity> meals) {
        if (!client.available()) return;
        for (int offset = 0; offset < meals.size(); offset += BATCH_SIZE) {
            List<MealEntity> batch = meals.subList(offset, Math.min(offset + BATCH_SIZE, meals.size()));
            try {
                List<double[]> vectors = client.embed(batch.stream().map(this::descriptiveText).toList());
                if (vectors.size() != batch.size()) throw new IllegalStateException("Embedding batch size mismatch");
                for (int i = 0; i < batch.size(); i++) batch.get(i).setSemanticEmbedding(encode(vectors.get(i)));
            } catch (RuntimeException ex) {
                log.warn("Meal embedding batch failed; records remain searchable by hard filters: {}", ex.getMessage());
            }
        }
    }

    public String encode(double[] vector) {
        if (vector.length == 0) throw new IllegalArgumentException("Empty embedding");
        List<Double> values = new ArrayList<>(vector.length);
        for (double value : vector) {
            if (!Double.isFinite(value)) throw new IllegalArgumentException("Non-finite embedding value");
            values.add(value);
        }
        return mapper.writeValueAsString(values);
    }

    public double[] decode(String encoded) {
        JsonNode values = mapper.readTree(encoded);
        if (!values.isArray() || values.isEmpty()) throw new IllegalArgumentException("Invalid stored embedding");
        double[] vector = new double[values.size()];
        for (int i = 0; i < vector.length; i++) vector[i] = values.get(i).asDouble();
        return vector;
    }

    public static double cosine(double[] query, double[] stored) {
        if (query.length != stored.length || query.length == 0) return Double.NEGATIVE_INFINITY;
        double dot = 0, qNorm = 0, sNorm = 0;
        for (int i = 0; i < query.length; i++) {
            dot += query[i] * stored[i];
            qNorm += query[i] * query[i];
            sNorm += stored[i] * stored[i];
        }
        return qNorm == 0 || sNorm == 0 ? Double.NEGATIVE_INFINITY : dot / Math.sqrt(qNorm * sNorm);
    }
}
