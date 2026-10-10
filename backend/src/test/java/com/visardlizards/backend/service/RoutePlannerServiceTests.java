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
    @Test void reportsGoogleDailyQuotaInsteadOfGenericBadGateway() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.openai.com/v1/responses"))
            .andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"type\":\"function_call\",\"name\":\"get_route_options\",\"call_id\":\"c1\"}]}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://router/api/tools/routes"))
            .andRespond(withStatus(org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT)
                .contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"google_routes_daily_quota\",\"error\":\"private-provider-payload\"}"));
        var failure=assertThrows(ResponseStatusException.class,()->service(builder.build()).plan(trip(),"key"));
        assertEquals(429,failure.getStatusCode().value());
        assertTrue(failure.getReason().contains("Google Routes daily quota"));
        assertFalse(failure.getReason().contains("private-provider-payload")); server.verify();
    }
    private final JsonMapper mapper=JsonMapper.builder().build();
    private final MensaRepository repository=mock(MensaRepository.class);
    private final Clock clock=Clock.fixed(Instant.parse("2026-10-10T20:00:00Z"),ZoneOffset.UTC);
    private Trip trip() { return new Trip("Zürich HB","ETH Zentrum",Instant.parse("2026-10-12T09:00:00Z"),Instant.parse("2026-10-12T12:00:00Z"),60); }
    private RoutePlannerService service(RestClient client) { return new RoutePlannerService(mapper,repository,clock,"http://router","connector-secret-123","gpt-6-astra",client); }
    @Test void keyOnlyGoesToOpenAiAndUserTripOverridesModelArguments() {
        when(repository.findAllMensas()).thenReturn(List.of()); when(repository.findMealsOn(any())).thenReturn(List.of());
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer user-openai-secret"))
            .andExpect(jsonPath("$.store").value(false)).andExpect(jsonPath("$.tool_choice.name").value("get_route_options"))
            .andRespond(withSuccess(mapper.writeValueAsString(Map.of("status","completed","output",List.of(
                Map.of("type","reasoning","id","r1","summary",List.of()),
                Map.of("type","function_call","name","get_route_options","call_id","c1","arguments",mapper.writeValueAsString(Map.of("destination","malicious")))))),MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://router/api/tools/routes")).andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(headerDoesNotExist("X-OpenAI-Key")).andExpect(jsonPath("$.destination").value("ETH Zentrum"))
            .andExpect(jsonPath("$.arrivalTime").value("2026-10-12T12:00:00Z"))
            .andRespond(withSuccess("{\"sessionId\":\"trusted-session\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer user-openai-secret"))
            .andExpect(jsonPath("$.tool_choice.name").value("find_meal_stops"))
            .andRespond(withSuccess(call("find_meal_stops","c2","{\"maxStops\":2,\"sessionId\":\"malicious-session\"}"),MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://router/api/tools/stops")).andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(jsonPath("$.sessionId").value("trusted-session")).andExpect(jsonPath("$.maxStops").value(2))
            .andRespond(withSuccess("{\"options\":[{}]}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer user-openai-secret"))
            .andExpect(jsonPath("$.tool_choice.name").value("show_route_on_map"))
            .andRespond(withSuccess(call("show_route_on_map","c3","{\"optionIndex\":0}"),MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://router/api/tools/show")).andExpect(header("Authorization","Bearer connector-secret-123"))
            .andExpect(jsonPath("$.sessionId").value("trusted-session")).andExpect(jsonPath("$.optionIndex").value(0))
            .andRespond(withSuccess("{\"options\":[{}],\"selectedOptionIndex\":0}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer user-openai-secret"))
            .andExpect(jsonPath("$.tool_choice").value("none")).andExpect(jsonPath("$.input[1].type").value("reasoning"))
            .andExpect(jsonPath("$.input[3].call_id").value("c1"))
            .andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"Try leaving earlier.\"}]}]}",MediaType.APPLICATION_JSON));
        var result=service(builder.build()).plan(trip(),"user-openai-secret");
        assertEquals("Try leaving earlier.",result.path("explanation").asText()); assertFalse(result.toString().contains("secret")); server.verify();
        assertEquals(0,result.path("plan").path("selectedOptionIndex").asInt()); assertEquals(3,result.path("toolCalls").size());
    }
    private String call(String name, String id, String args) {
        return mapper.writeValueAsString(Map.of("status","completed","output",List.of(Map.of("type","function_call","name",name,"call_id",id,"arguments",args))));
    }
    @Test void rejectsMissingKeyPastAndCrossDateTripsBeforeAnyNetworkCall() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build(); var service=service(builder.build());
        assertThrows(ResponseStatusException.class,()->service.plan(trip(),""));
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
    @Test void neverCallsUnsupportedModelTools() {
        when(repository.findAllMensas()).thenReturn(List.of()); when(repository.findMealsOn(any())).thenReturn(List.of());
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.openai.com/v1/responses")).andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"type\":\"function_call\",\"name\":\"shell\",\"call_id\":\"x\"}]}",MediaType.APPLICATION_JSON));
        assertThrows(ResponseStatusException.class,()->service(builder.build()).plan(trip(),"key")); server.verify();
    }
}
