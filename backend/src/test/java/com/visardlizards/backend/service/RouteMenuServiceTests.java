package com.visardlizards.backend.service;

import com.visardlizards.backend.model.db.ScrapedMenuEntity;
import com.visardlizards.backend.repository.ScrapedMenuEntityRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RouteMenuServiceTests {
    final JsonMapper mapper=JsonMapper.builder().build();
    final ScrapedMenuEntityRepository cache=mock(ScrapedMenuEntityRepository.class);
    final Clock clock=Clock.fixed(Instant.parse("2026-10-11T09:00:00Z"),ZoneOffset.UTC);
    final String plan="""
        {"options":[{"place":{"kind":"cafeteria","sourceUrl":"https://menu.example/venue"},
        "mealStart":"2026-10-12T10:00:00Z","mealEnd":"2026-10-12T11:00:00Z"}]}
        """;
    RouteMenuService service(RestClient client) {return new RouteMenuService(mapper,cache,clock,"http://scraper","connector-secret",client);}
    @Test void verifiedSourceAndMealDateCallDedicatedMcpThenPersistRawDataAndReuseAfterRestart() {
        var saved=new HashMap<String,ScrapedMenuEntity>();
        when(cache.findById(anyString())).thenAnswer(call->Optional.ofNullable(saved.get(call.getArgument(0))));
        when(cache.save(any())).thenAnswer(call->{ScrapedMenuEntity row=call.getArgument(0);saved.put(row.getId(),row);return row;});
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var service=service(builder.build());
        server.expect(requestTo("http://scraper/api/meals/scrape")).andExpect(header("Authorization","Bearer connector-secret"))
            .andExpect(headerDoesNotExist("X-OpenAI-Key")).andExpect(jsonPath("$.url").value("https://menu.example/venue"))
            .andExpect(jsonPath("$.date").value("2026-10-12"))
            .andRespond(withSuccess("""
                {"status":"meals_found","meals":[{"name":"Old","date":"2026-10-11"},{"name":"Pasta","date":"2026-10-12"},
                {"name":"Pasta","date":"2026-10-12"},{"name":"Daily","date":null},{"name":"Dinner","date":"2026-10-12","timeStart":"18:00"}]}
                """,MediaType.APPLICATION_JSON));
        String id=service.register(mapper.readTree(plan));var result=service.menu(id,0);
        assertEquals(2,result.path("meals").size());assertEquals("Pasta",result.path("meals").get(0).path("name").asText());
        assertEquals(5,mapper.readTree(saved.values().iterator().next().getPayload()).path("result").path("meals").size(),"Store full raw evidence before meal-time filtering");
        var restarted=service(RestClient.create());assertEquals(result,restarted.menu(restarted.register(mapper.readTree(plan)),0));server.verify();
    }
    @Test void inventedExpiredAndOutOfBoundsOptionsCannotCauseNetworkCalls() {
        var service=service(RestClient.create());
        assertThrows(ResponseStatusException.class,()->service.menu("invented",0));
        String id=service.register(mapper.readTree(plan));
        assertThrows(ResponseStatusException.class,()->service.menu(id,4));
        var later=new RouteMenuService(mapper,cache,Clock.offset(clock,Duration.ofHours(1)),"http://scraper","secret",RestClient.create());
        assertThrows(ResponseStatusException.class,()->later.menu(id,0));verifyNoInteractions(cache);
        assertEquals("source_unavailable",service.menu(service.register(mapper.readTree(plan.replace("https://menu.example/venue","javascript:alert(1)"))),0).path("status").asText());
    }
    @Test void closuresSuppressMenuAndScraperFailuresNeverLeakProviderDetails() {
        var service=service(RestClient.create());
        var closed=mapper.readTree("""
            {"meals":[{"name":"Daily"}],"availability":[{"status":"closed","dateFrom":"2026-10-12","dateTo":"2026-10-13"}]}
            """);
        assertEquals("closed",service.forMeal(closed,Instant.parse("2026-10-12T10:00:00Z"),Instant.parse("2026-10-12T11:00:00Z")).path("status").asText());
        assertTrue(service.forMeal(closed,Instant.parse("2026-10-12T10:00:00Z"),Instant.parse("2026-10-12T11:00:00Z")).path("meals").isEmpty());
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://scraper/api/meals/scrape")).andRespond(withServerError().body("private-secret"));
        service=service(builder.build());var result=service.menu(service.register(mapper.readTree(plan)),0);
        assertEquals("unavailable",result.path("status").asText());assertFalse(result.toString().contains("private-secret"));server.verify();
    }
    @Test void otherRestaurantMenusDoNotRequireMatchingDaysOrServingTimes() {
        var service=service(RestClient.create());
        var raw=mapper.readTree("""
            {"meals":[{"name":"Pizza","date":"2026-10-13","timeStart":"18:00","timeEnd":"20:00","sourceUrl":"https://restaurant.example/menu","price":{"amount":18}},
            {"name":"Pizza","date":"2026-10-14","timeStart":"18:00"},{"name":"Soup","date":null}]}
            """);
        var result=service.forMeal(raw,Instant.parse("2026-10-12T10:00:00Z"),Instant.parse("2026-10-12T11:00:00Z"),true);
        assertEquals(2,result.path("meals").size());assertTrue(result.path("generalMenu").asBoolean());
        var pizza=result.path("meals").get(0);assertFalse(pizza.has("date"));assertFalse(pizza.has("timeStart"));assertFalse(pizza.has("timeEnd"));
        assertEquals(18,pizza.path("price").path("amount").asInt());assertEquals("https://restaurant.example/menu",pizza.path("sourceUrl").asText());
    }
}
