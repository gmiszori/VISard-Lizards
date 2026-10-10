package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class OpenAiEmbeddingClient implements EmbeddingClient {
    private final RestClient client;
    private final JsonMapper mapper;
    private final String apiKey;
    private final String model;

    public OpenAiEmbeddingClient(JsonMapper mapper,
            @Value("${openai.api-key:}") String apiKey,
            @Value("${openai.embedding-model:text-embedding-3-small}") String model) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.client = RestClient.builder().requestFactory(factory).build();
        this.mapper = mapper;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public boolean available() {
        return apiKey != null && !apiKey.isBlank();
    }

    @Override
    public List<double[]> embed(List<String> inputs) {
        if (inputs.isEmpty()) return List.of();
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Embedding API is not configured");
        String response = client.post().uri("https://api.openai.com/v1/embeddings")
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + apiKey)
                .body(Map.of("model", model, "input", inputs, "encoding_format", "float"))
                .retrieve().body(String.class);
        JsonNode data = mapper.readTree(response).path("data");
        if (!data.isArray() || data.size() != inputs.size())
            throw new IllegalStateException("Embedding API returned an incomplete batch");
        double[][] ordered = new double[inputs.size()][];
        for (JsonNode item : data) {
            int index = item.path("index").asInt(-1);
            JsonNode values = item.path("embedding");
            if (index < 0 || index >= ordered.length || !values.isArray() || values.isEmpty() || ordered[index] != null)
                throw new IllegalStateException("Embedding API returned an invalid vector");
            double[] vector = new double[values.size()];
            for (int i = 0; i < vector.length; i++) vector[i] = values.get(i).asDouble();
            ordered[index] = vector;
        }
        if (Arrays.stream(ordered).anyMatch(v -> v == null))
            throw new IllegalStateException("Embedding API omitted a vector");
        return new ArrayList<>(Arrays.asList(ordered));
    }
}
