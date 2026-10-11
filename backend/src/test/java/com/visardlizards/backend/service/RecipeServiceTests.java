package com.visardlizards.backend.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RecipeServiceTests {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final RecipeService.RecipeRequest dish =
        new RecipeService.RecipeRequest("Mushroom Risotto", "with herbs", "vegetarian", 2, "en");

    @Test void returnsStructuredRecipeWithoutExposingKey() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new RecipeService(mapper, "recipe-secret", "gpt-4.1-mini", builder.build());
        var recipe = Map.of("title", "Mushroom Risotto", "intro", "A home version.", "minutes", 35,
            "ingredients", List.of(Map.of("amount", "200 g", "item", "rice"),
                Map.of("amount", "150 g", "item", "mushrooms")),
            "steps", List.of("Prepare the mushrooms.", "Cook the rice."));
        var reply = Map.of("status", "completed", "output", List.of(Map.of("type", "message",
            "content", List.of(Map.of("type", "output_text", "text", mapper.writeValueAsString(recipe))))));
        server.expect(requestTo("https://api.openai.com/v1/responses"))
            .andExpect(header("Authorization", "Bearer recipe-secret"))
            .andExpect(jsonPath("$.store").value(false))
            .andExpect(jsonPath("$.text.format.name").value("home_recipe"))
            .andRespond(withSuccess(mapper.writeValueAsString(reply), MediaType.APPLICATION_JSON));

        var result = service.generate(dish);
        assertEquals(2, result.servings());
        assertEquals(35, result.minutes());
        assertEquals("rice", result.ingredients().getFirst().item());
        assertFalse(mapper.writeValueAsString(result).contains("recipe-secret"));
        server.verify();
    }

    @Test void missingKeyNeverCallsProvider() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new RecipeService(mapper, "", "gpt-4.1-mini", builder.build());
        var error = assertThrows(ResponseStatusException.class, () -> service.generate(dish));
        assertEquals(503, error.getStatusCode().value());
        server.verify();
    }

    @Test void malformedRecipeReturnsSanitizedGatewayError() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new RecipeService(mapper, "recipe-secret", "gpt-4.1-mini", builder.build());
        var reply = Map.of("status", "completed", "output", List.of(Map.of("type", "message",
            "content", List.of(Map.of("type", "output_text", "text", "{}")))));
        server.expect(requestTo("https://api.openai.com/v1/responses"))
            .andRespond(withSuccess(mapper.writeValueAsString(reply), MediaType.APPLICATION_JSON));
        var error = assertThrows(ResponseStatusException.class, () -> service.generate(dish));
        assertEquals(502, error.getStatusCode().value());
        assertFalse(error.getReason().contains("recipe-secret"));
        server.verify();
    }

    @Test void exactDessertOfTheDayGetsRandomIdeaAndFixedTitle() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new RecipeService(mapper, "recipe-secret", "gpt-4.1-mini", builder.build());
        var recipe = Map.of("title", "A model-provided title", "intro", "A sweet treat.", "minutes", 25,
            "ingredients", List.of(Map.of("amount", "200 g", "item", "fruit"),
                Map.of("amount", "50 g", "item", "sugar")),
            "steps", List.of("Prepare the fruit.", "Serve the dessert."));
        var reply = Map.of("status", "completed", "output", List.of(Map.of("type", "message",
            "content", List.of(Map.of("type", "output_text", "text", mapper.writeValueAsString(recipe))))));
        server.expect(requestTo("https://api.openai.com/v1/responses"))
            .andExpect(request -> {
                var body = mapper.readTree(((MockClientHttpRequest) request).getBodyAsString());
                var input = mapper.readTree(body.path("input").asText());
                assertTrue(RecipeService.SURPRISE_IDEAS.contains(input.path("dish").asText()));
                assertEquals("", input.path("description").asText());
            })
            .andRespond(withSuccess(mapper.writeValueAsString(reply), MediaType.APPLICATION_JSON));

        var result = service.generate(new RecipeService.RecipeRequest(
            "Dessert of the day", "Chef's choice", "vegetarian", 2, "en"));
        assertEquals("SURPRISE DESSERT ✨", result.title());
        assertEquals("A sweet treat.", result.intro());
        server.verify();
    }

    @Test void similarDessertNamesKeepNormalRecipeBehavior() {
        for (String name : List.of("Dessert of the Day", "Dessert of the day ")) {
            var builder = RestClient.builder();
            var server = MockRestServiceServer.bindTo(builder).build();
            var service = new RecipeService(mapper, "recipe-secret", "gpt-4.1-mini", builder.build());
            var recipe = Map.of("title", "Ordinary dessert", "intro", "A sweet treat.", "minutes", 25,
                "ingredients", List.of(Map.of("amount", "200 g", "item", "fruit"),
                    Map.of("amount", "50 g", "item", "sugar")),
                "steps", List.of("Prepare the fruit.", "Serve the dessert."));
            var reply = Map.of("status", "completed", "output", List.of(Map.of("type", "message",
                "content", List.of(Map.of("type", "output_text", "text", mapper.writeValueAsString(recipe))))));
            server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andExpect(request -> {
                    var body = mapper.readTree(((MockClientHttpRequest) request).getBodyAsString());
                    var input = mapper.readTree(body.path("input").asText());
                    assertEquals(name, input.path("dish").asText());
                })
                .andRespond(withSuccess(mapper.writeValueAsString(reply), MediaType.APPLICATION_JSON));
            assertEquals("Ordinary dessert", service.generate(new RecipeService.RecipeRequest(
                name, "Chef's choice", "vegetarian", 2, "en")).title());
            server.verify();
        }
    }
}
