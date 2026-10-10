package com.visardlizards.backend.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import com.visardlizards.backend.model.dto.RealtimeVoiceSessionRequest;
import com.visardlizards.backend.model.dto.RealtimeVoiceSessionResponse;
import com.visardlizards.backend.repository.HybridMealRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Issues short-lived browser credentials for a Realtime voice meal-search session. */
@Service
public class OpenAiRealtimeSessionService {
    private final RestClient client;
    private final JsonMapper mapper;
    private final HybridMealRepository repository;
    private final String apiKey;
    private final String model;

    public OpenAiRealtimeSessionService(JsonMapper mapper, HybridMealRepository repository,
            @Value("${openai.api-key:}") String apiKey,
            @Value("${openai.realtime-model:gpt-realtime-2.1-mini}") String model) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(12));
        this.client = RestClient.builder().requestFactory(factory).build();
        this.mapper = mapper;
        this.repository = repository;
        this.apiKey = apiKey;
        this.model = model;
    }

    public RealtimeVoiceSessionResponse create(RealtimeVoiceSessionRequest request) {
        if (apiKey == null || apiKey.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI Realtime is not configured");
        String mensaId = allowedOrNull(request.activeMensaId(), repository.mensaIds(), "mensa");
        String campusId = allowedOrNull(request.activeCampusId(), repository.campusIds(), "campus");
        String instructions = """
You are UniEats, a voice assistant exclusively for campus dining, cafeterias, and meals.

Scope & Guardrails:
- Domain: Only handle queries about food, meals, cafeterias, campus dining venues, opening hours, menus, prices, and venue locations/distances.
- Out of scope: Strictly refuse any request unrelated to dining or cafeterias with: "I only assist with campus meals and cafeterias."

Operational constraints:
- Meal answers: Use only the structured meal data supplied with the response. Do not answer a meal lookup before that data is supplied. Never mention internal criteria, JSON, databases, or backend operations.
- Food recommendations: Present up to 3 best options strictly formatted as "Dish — venue — price". Omit the price if unavailable. If specifically asked for prices and none are found, say: "I don't know the prices."
- Venue & distance queries: State the venue name and distance or location directly in 1 short sentence.
- Unknowns / No matches: State plainly that you do not know or that no options match.
- Length: Strictly under 30 words per turn."
- Style: Direct, natural spoken English. No filler words, greetings, status updates ("Let me check"), summaries, or unprompted follow-up offers.
- Unclear input: If user speech is directed to you but unintelligible, reply only: "Sorry, I didn't understand." 
                """;

        Map<String, Object> session = Map.of(
                "type", "realtime",
                "model", model,
                "instructions", instructions,
                "output_modalities", List.of("audio"),
                "audio", Map.of(
                        "input", Map.of(
                                "noise_reduction", Map.of("type", "near_field"),
                                "transcription", Map.of("model", "gpt-4o-mini-transcribe", "prompt",
                                        "This is live English or German/Swiss German speech about ETH Zurich cafeteria food, campus venues, and prices. Common terms include ETH, Zentrum, Hönggerberg, Irchel, Polysnack, Mensa, CHF, francs, Franken, vegan, chicken, rice, and dish names. Preserve the words and amounts actually spoken; do not invent or replace them."),
                                "turn_detection", Map.of("type", "server_vad", "threshold", 0.65,
                                        "prefix_padding_ms", 300, "silence_duration_ms", 1000,
                                        "create_response", false, "interrupt_response", false)),
                        "output", Map.of("voice", "marin")),
                "max_output_tokens", 600);
        Map<String, Object> body = Map.of(
                "expires_after", Map.of("anchor", "created_at", "seconds", 60),
                "session", session);
        try {
            String response = client.post().uri("https://api.openai.com/v1/realtime/client_secrets")
                    .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body).retrieve().body(String.class);
            JsonNode root = mapper.readTree(response);
            String secret = root.path("value").asText();
            if (secret.isBlank()) throw new IllegalStateException("Realtime secret missing from provider response");
            return new RealtimeVoiceSessionResponse(secret, root.path("expires_at").asLong(), instructions);
        } catch (RestClientResponseException ex) {
            String providerMessage = "";
            try {
                JsonNode error = mapper.readTree(ex.getResponseBodyAsString()).path("error");
                String message = error.path("message").asText("");
                String code = error.path("code").asText("");
                if (!message.isBlank()) providerMessage = ": " + message;
                if (!code.isBlank()) providerMessage += " [" + code + "]";
            } catch (Exception ignored) {
                // Keep the status useful even if the provider returned a non-JSON error body.
            }
            if (providerMessage.length() > 500) providerMessage = providerMessage.substring(0, 500);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "OpenAI Realtime rejected the session request (HTTP " + ex.getStatusCode().value() + ")"
                            + providerMessage);
        } catch (RestClientException ex) {
            String cause = ex.getMostSpecificCause() == null ? ex.getClass().getSimpleName()
                    : ex.getMostSpecificCause().getClass().getSimpleName();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Could not reach OpenAI Realtime (" + cause + ")");
        }
    }

    private static String allowedOrNull(String value, List<String> allowed, String label) {
        if (value == null || value.isBlank()) return null;
        if (!allowed.contains(value)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown active " + label);
        return value;
    }
}
