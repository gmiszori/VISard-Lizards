package com.visardlizards.backend.service;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.http.MediaType;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ScraperAiClientTests {
    private final JsonMapper mapper=JsonMapper.builder().build();
    private String json(Object value) { return mapper.writeValueAsString(value); }
    private String tools() { return json(Map.of("tools",List.of("discover_menu_sources","scrape_meals","read_menu_source").stream().map(name->Map.of("name",name,"type","function")).toList())); }
    private Map<String,Object> call(String name,String id,String url) {return Map.of("type","function_call","name",name,"call_id",id,"arguments",json(Map.of("url",url,"date","2000-01-01")));}
    private String response(Object... output) {return json(Map.of("status","completed","output",List.of(output)));}
    private String toolOutput(String id,Object data) {return json(Map.of("type","function_call_output","call_id",id,"output",json(data)));}
    @Test void modelChoosesPdfViaMcpAndKeyStaysOnOpenAi() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        var client=new ScraperAiClient(mapper,"openai-secret","gpt-6-astra","http://connector","relay-secret",builder.build());
        server.expect(requestTo("http://connector/api/ai/tools")).andExpect(header("Authorization","Bearer relay-secret")).andRespond(withSuccess(tools(),MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(header("Authorization","Bearer openai-secret"))
            .andExpect(jsonPath("$.tool_choice.name").value("discover_menu_sources"))
            .andExpect(jsonPath("$.model").value("gpt-6-astra"))
            .andExpect(jsonPath("$.reasoning.effort").value("low"))
            .andExpect(jsonPath("$.max_output_tokens").value(8000))
            .andRespond(withSuccess(response(Map.of("type","reasoning","id","r1","summary",List.of()),call("discover_menu_sources","d1","https://venue.example")),MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://connector/api/ai/tools/call")).andExpect(header("Authorization","Bearer relay-secret"))
            .andExpect(jsonPath("$.name").value("discover_menu_sources"))
            .andExpect(jsonPath("$.arguments.date").value("2099-10-19"))
            .andRespond(withSuccess(toolOutput("d1",Map.of("sources",List.of(Map.of("url","https://venue.example/menu.pdf","kind","pdf")))),MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(jsonPath("$.input[1].type").value("reasoning"))
            .andExpect(jsonPath("$.input[3].call_id").value("d1"))
            .andRespond(withSuccess(response(call("scrape_meals","s1","https://venue.example/menu.pdf")),MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://connector/api/ai/tools/call")).andExpect(header("Authorization","Bearer relay-secret"))
            .andExpect(jsonPath("$.arguments.url").value("https://venue.example/menu.pdf"))
            .andExpect(jsonPath("$.arguments.date").value("2099-10-19"))
            .andRespond(withSuccess(toolOutput("s1",Map.of("meals",List.of(Map.of("id","soup","name","Soup","details",Map.of("nutrition",1))),"availability",List.of(Map.of("status","closed")))),MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andExpect(jsonPath("$.tool_choice").value("auto"))
            .andRespond(withSuccess(response(Map.of("type","message","content",List.of(Map.of("type","output_text","text","Menu retrieved.")))),MediaType.APPLICATION_JSON));
        var result=client.retrieve("https://venue.example", java.time.LocalDate.parse("2099-10-19"));
        assertEquals(2,result.path("toolResults").size());
        assertEquals(1,result.path("toolResults").get(1).path("data").path("meals").get(0).path("details").path("nutrition").asInt());
        assertEquals("Menu retrieved.",result.path("explanation").asText());
        assertFalse(result.toString().contains("secret")); server.verify();
    }
    @Test void missingKeyNeverCallsNetwork() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        var client=new ScraperAiClient(mapper,"","test","http://connector","",builder.build());
        assertThrows(IllegalStateException.class,()->client.retrieve("https://venue.example")); server.verify();
    }
    @Test void unsupportedToolsNeverReachConnector() {
        var builder=RestClient.builder(); var server=MockRestServiceServer.bindTo(builder).build();
        var client=new ScraperAiClient(mapper,"fake","test","http://connector","",builder.build());
        server.expect(requestTo("http://connector/api/ai/tools")).andRespond(withSuccess(tools(),MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.openai.com/v1/responses")).andRespond(withSuccess(response(call("shell","bad","https://venue.example")),MediaType.APPLICATION_JSON));
        assertThrows(IllegalStateException.class,()->client.retrieve("https://venue.example")); server.verify();
    }
}
