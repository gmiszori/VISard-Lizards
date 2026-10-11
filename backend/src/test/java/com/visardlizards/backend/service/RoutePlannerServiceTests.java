package com.visardlizards.backend.service;

import com.visardlizards.backend.controller.RoutePlannerController.Trip;
import com.visardlizards.backend.repository.MensaRepository;
import com.visardlizards.backend.model.domain.*;
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

class RoutePlannerServiceTests {
    private final JsonMapper mapper=JsonMapper.builder().build();
    private final MensaRepository repository=mock(MensaRepository.class);
    private final Clock clock=Clock.fixed(Instant.parse("2026-10-10T20:00:00Z"),ZoneOffset.UTC);
    private Trip trip() { return new Trip("Zürich HB","ETH Zentrum",Instant.parse("2026-10-12T09:00:00Z"),Instant.parse("2026-10-12T12:00:00Z"),60); }
    @Test void journeyTimingIncludesInitialWaitMealTransferWaitAndDeadlineSlack() {
        var plan=mapper.readTree("""
            {"options":[{"mealStart":"2026-10-12T09:20:00Z","mealEnd":"2026-10-12T10:20:00Z","arrival":"2026-10-12T10:40:00Z",
            "outbound":{"departure":"2026-10-12T09:05:00Z","arrival":"2026-10-12T09:20:00Z","provider":{"itinerary":[
            {"departure":"2026-10-12T09:05:00Z","arrival":"2026-10-12T09:10:00Z"},{"departure":"2026-10-12T09:15:00Z","arrival":"2026-10-12T09:20:00Z"}]}},
            "onward":{"departure":"2026-10-12T10:30:00Z","arrival":"2026-10-12T10:40:00Z"}}]}
            """);
        service(RestClient.create()).addTiming(plan,trip());var timing=plan.path("options").get(0).path("timing");
        assertEquals(6000,timing.path("totalSeconds").asLong());assertEquals(1200,timing.path("travelSeconds").asLong());
        assertEquals(3600,timing.path("mealSeconds").asLong());assertEquals(1200,timing.path("waitingSeconds").asLong());
        assertEquals(4800,timing.path("spareSeconds").asLong());
    }
    @Test void mealRangeRelaysToMcpAndRejectsInvalidBounds() {
        var base=trip();var service=service(RestClient.create());
        var range=new Trip(base.origin(),base.destination(),base.departureTime(),base.arrivalTime(),5,List.of("TRANSIT"),120);
        service.validate(range,"");assertEquals(5,service.tripContext(range).path("mealMinutes").asInt());
        assertEquals(120,service.tripContext(range).path("mealMaxMinutes").asInt());
        assertEquals(60,base.mealMaxMinutes());
        for(int maximum:List.of(4,121,30)) assertThrows(ResponseStatusException.class,()->service.validate(new Trip(base.origin(),base.destination(),base.departureTime(),base.arrivalTime(),45,List.of("TRANSIT"),maximum),""));
    }
    @Test void modesArePreservedAndEmptySelectionRejectedBeforeProviders() {
        var base=trip();var transit=new Trip(base.origin(),base.destination(),base.departureTime(),base.arrivalTime(),60,List.of("TRANSIT"));
        var service=service(RestClient.create());
        assertEquals("TRANSIT",service.tripContext(transit).path("modes").get(0).asText());
        assertEquals(List.of("WALK","TRANSIT"),base.modes());
        assertThrows(ResponseStatusException.class,()->service.validate(new Trip(base.origin(),base.destination(),base.departureTime(),base.arrivalTime(),60,List.of()),""));
    }
    private RoutePlannerService service(RestClient client) { return new RoutePlannerService(mapper,repository,clock,"http://router","connector-secret-123","gpt-6-astra",client); }
    @Test void locationSuggestionsRelayWithoutOpenAiAndValidateBeforeNetwork() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var service=service(builder.build());
        assertTrue(service.locations("ab").path("locations").isEmpty());
        assertThrows(ResponseStatusException.class,()->service.locations("x".repeat(201)));
        server.expect(requestTo("http://router/api/locations"))
            .andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(headerDoesNotExist("X-OpenAI-Key"))
            .andExpect(jsonPath("$.query").value("Zürich"))
            .andRespond(withSuccess("{\"locations\":[{\"label\":\"Zürich HB\",\"latitude\":47.378,\"longitude\":8.54}]}",MediaType.APPLICATION_JSON));
        assertEquals(47.378,service.locations(" Zürich ").path("locations").get(0).path("latitude").asDouble());
        server.verify();verifyNoInteractions(repository);
    }
    @Test void rejectsMissingKeyPastAndCrossDateTripsBeforeAnyNetworkCall() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build(); var service=service(builder.build());
        assertThrows(ResponseStatusException.class,()->service.plan(trip(),"bad\nkey"));
        assertThrows(ResponseStatusException.class,()->service.plan(new Trip("A","B",clock.instant().minusSeconds(300),clock.instant().plusSeconds(600),60),"key"));
        assertThrows(ResponseStatusException.class,()->service.plan(new Trip("A","B",Instant.parse("2026-10-12T21:00:00Z"),Instant.parse("2026-10-12T23:00:00Z"),60),"key"));
        verifyNoInteractions(repository); server.verify();
    }
    @Test void usesOnlyCachedDatedMenusWithMatchingServiceHoursAndHonoursClosures() {
        var date=LocalDate.parse("2026-10-12");
        var mensa=new Mensa("test","Test","ETH","zentrum",new Address("Street","8000","Zürich",null),new Coordinates(47.37,8.55,null),true,false,
            Map.of("mon",List.of(new ServiceHours("lunch",LocalTime.of(11,0),LocalTime.of(14,0)))),List.of(),null);
        var meal=new Meal("m","test",date,"lunch","Line","menu","Pasta",List.of(),"vegan",null,List.of(),null,null);
        when(repository.findAllMensas()).thenReturn(List.of(mensa)); when(repository.findMealsOn(date)).thenReturn(List.of(meal));
        var service=service(RestClient.create()); var context=service.tripContext(trip());
        assertEquals(1,context.path("cafeterias").size()); assertEquals("2026-10-12T09:00:00Z",context.path("cafeterias").get(0).path("windows").get(0).path("open").asText());
        when(repository.findAllMensas()).thenReturn(List.of(new Mensa(mensa.id(),mensa.name(),mensa.institution(),mensa.campusId(),mensa.address(),mensa.coordinates(),true,true,mensa.openingHours(),List.of(),null)));
        var closedContext=service.tripContext(trip());
        assertTrue(closedContext.path("cafeterias").isEmpty());
        assertEquals("Test",closedContext.path("closedPlaces").get(0).path("name").asText());
    }
    private void routes(MockRestServiceServer server) {
        server.expect(requestTo("http://router/api/tools/routes")).andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(headerDoesNotExist("X-OpenAI-Key")).andExpect(jsonPath("$.destination").value("ETH Zentrum"))
            .andRespond(withSuccess("{\"sessionId\":\"trusted-session\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://router/api/tools/stops")).andExpect(jsonPath("$.sessionId").value("trusted-session"))
            .andExpect(jsonPath("$.maxStops").value(4)).andRespond(withSuccess("{\"options\":[{},{}],\"warnings\":[]}",MediaType.APPLICATION_JSON));
    }
    private void selected(MockRestServiceServer server,int index) {
        server.expect(requestTo("http://router/api/tools/show")).andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(jsonPath("$.sessionId").value("trusted-session")).andExpect(jsonPath("$.optionIndex").value(index))
            .andRespond(withSuccess("{\"options\":[{},{}],\"warnings\":[],\"selectedOptionIndex\":"+index+"}",MediaType.APPLICATION_JSON));
    }
    @Test void verifiedRoutesSurviveOpenAiAuthenticationModelAndQuotaFailures() {
        for(int status:List.of(401,404,429)) {
            var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();routes(server);
            server.expect(requestTo("https://api.openai.com/v1/responses")).andRespond(withStatus(org.springframework.http.HttpStatus.valueOf(status))
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"message\":\"private-provider-message\"}}"));
            selected(server,0);var result=service(builder.build()).plan(trip(),"key");
            assertFalse(result.path("aiAvailable").asBoolean());assertEquals(0,result.path("plan").path("selectedOptionIndex").asInt());
            assertTrue(result.path("explanation").asText().contains("OpenAI"));assertFalse(result.toString().contains("private-provider-message"));server.verify();
        }
    }
    @Test void keyIsOptionalAndNotSentToMcp() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();routes(server);selected(server,0);
        var result=service(builder.build()).plan(trip(),"");assertFalse(result.path("aiAvailable").asBoolean());assertEquals(3,result.path("toolCalls").size());server.verify();
    }
    @Test void aiCanOnlySelectVerifiedRoutesAndKeyOnlyGoesToOpenAi() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();routes(server);
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer user-openai-secret"))
            .andExpect(jsonPath("$.store").value(false)).andExpect(jsonPath("$.tool_choice.name").value("show_route_on_map"))
            .andRespond(withSuccess(mapper.writeValueAsString(Map.of("status","completed","output",List.of(Map.of("type","function_call","name","show_route_on_map","call_id","c1","arguments",mapper.writeValueAsString(Map.of("optionIndex",1,"sessionId","malicious")))))),MediaType.APPLICATION_JSON));
        selected(server,1);
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(jsonPath("$.tool_choice").value("none"))
            .andExpect(jsonPath("$.input[2].call_id").value("c1"))
            .andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"content\":[{\"type\":\"output_text\",\"text\":\"Verified meal route.\"}]}]}",MediaType.APPLICATION_JSON));
        var result=service(builder.build()).plan(trip(),"user-openai-secret");assertEquals("Verified meal route.",result.path("explanation").asText());assertTrue(result.path("aiAvailable").asBoolean());assertFalse(result.toString().contains("secret"));server.verify();
    }
    @Test void invalidAiToolFallsBackWithoutExecutingIt() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();routes(server);
        server.expect(requestTo("https://api.openai.com/v1/responses")).andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"type\":\"function_call\",\"name\":\"shell\",\"call_id\":\"x\"}]}",MediaType.APPLICATION_JSON));
        selected(server,0);assertFalse(service(builder.build()).plan(trip(),"key").path("aiAvailable").asBoolean());server.verify();
    }
    @Test void providerFailureDoesNotTriggerOpenAi() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://router/api/tools/routes")).andRespond(withStatus(org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT)
            .contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"route_provider_busy\"}"));
        var failure=assertThrows(ResponseStatusException.class,()->service(builder.build()).plan(trip(),"key"));assertEquals(429,failure.getStatusCode().value());server.verify();
    }
    @Test void verifiedGeometrySurvivesAnExpiredMcpSelectionSession() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();routes(server);
        server.expect(requestTo("http://router/api/tools/show")).andRespond(withStatus(org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT)
            .contentType(MediaType.APPLICATION_JSON).body("{\"error\":\"Session expired\"}"));
        var result=service(builder.build()).plan(trip(),"");assertEquals(0,result.path("plan").path("selectedOptionIndex").asInt());
        assertEquals(2,result.path("plan").path("options").size());assertTrue(result.path("explanation").asText().contains("already-verified"));server.verify();
    }
    @Test void ambiguousLocationReturnsBadRequestWithoutCallingAi() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://router/api/tools/routes")).andRespond(withStatus(org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT)
            .contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"invalid_location\"}"));
        var failure=assertThrows(ResponseStatusException.class,()->service(builder.build()).plan(trip(),""));assertEquals(400,failure.getStatusCode().value());server.verify();
    }

}
