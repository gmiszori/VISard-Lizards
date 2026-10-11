package com.visardlizards.backend.service;

import com.visardlizards.backend.model.db.ScrapedMenuEntity;
import com.visardlizards.backend.repository.ScrapedMenuEntityRepository;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Only a server-verified route option can initiate a menu lookup; the browser supplies no URL. */
@Service
public class RouteMenuService {
    private record Options(JsonNode values, Instant expires) { }
    private static final ZoneId ZURICH=ZoneId.of("Europe/Zurich");
    private final Map<String,Options> plans=new LinkedHashMap<>();
    private final Semaphore busy=new Semaphore(1);
    private final JsonMapper mapper;
    private final ScrapedMenuEntityRepository cache;
    private final Clock clock;
    private final RestClient client;
    private final String url,token;
    @org.springframework.beans.factory.annotation.Autowired
    public RouteMenuService(JsonMapper mapper,ScrapedMenuEntityRepository cache,Clock clock,
            @Value("${app.scraper.connector-url:http://127.0.0.1:8091}") String url,
            @Value("${app.scraper.connector-token:}") String token) {
        this(mapper,cache,clock,url,token,client());
    }
    RouteMenuService(JsonMapper mapper,ScrapedMenuEntityRepository cache,Clock clock,String url,String token,RestClient client) {
        this.mapper=mapper;this.cache=cache;this.clock=clock;this.url=url.replaceAll("/+$","");this.token=token;this.client=client;
    }
    private static RestClient client() {
        var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build());
        factory.setReadTimeout(Duration.ofSeconds(250));
        return RestClient.builder().requestFactory(factory).build();
    }
    public synchronized String register(JsonNode plan) {
        plans.entrySet().removeIf(entry->!entry.getValue().expires().isAfter(clock.instant()));
        if(plans.size()>=32) plans.remove(plans.keySet().iterator().next());
        String id=UUID.randomUUID().toString();
        plans.put(id,new Options(plan.path("options").deepCopy(),clock.instant().plusSeconds(1800)));
        return id;
    }
    private synchronized JsonNode option(String id,int index) {
        var plan=plans.get(id);
        if(plan==null || !plan.expires().isAfter(clock.instant())) {
            plans.remove(id);throw new ResponseStatusException(HttpStatus.GONE,"This route expired. Plan your journey again to load its menus.");
        }
        if(index<0 || index>=plan.values().size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Select an existing meal stop.");
        return plan.values().get(index);
    }
    public JsonNode menu(String planId,int index) {
        JsonNode option=option(planId,index),place=option.path("place");
        var start=Instant.parse(option.path("mealStart").asText());var end=Instant.parse(option.path("mealEnd").asText());
        var date=start.atZone(ZURICH).toLocalDate();
        String source=source(place);
        if(source.isBlank()) return empty("source_unavailable","No website menu source is available for this stop.");
        String id="route-menu.v2."+UUID.nameUUIDFromBytes((source+"|"+date).getBytes(StandardCharsets.UTF_8));
        JsonNode raw=cached(id);
        if(raw==null) {
            if(!busy.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Another menu is loading. Try again shortly.");
            try {
                raw=cached(id);
                if(raw==null) {
                    try {
                        // scrape_meals itself discovers linked HTML/PDF menus and invokes the dedicated MCP server.
                        raw=mapper.readTree(client.post().uri(url+"/api/meals/scrape").contentType(MediaType.APPLICATION_JSON)
                            .header("Authorization","Bearer "+token)
                            .body(mapper.createObjectNode().put("url",source).put("date",date.toString()).toString())
                            .retrieve().body(String.class));
                        if(raw.has("error") || !raw.path("meals").isArray()) throw new IllegalStateException("Invalid scraper output.");
                    } catch(RuntimeException failure) {
                        raw=empty("unavailable","Website menu could not be retrieved. The journey and database meals remain available.");
                    }
                    var entry=mapper.createObjectNode().put("updatedAt",clock.instant().toString()).set("result",raw);
                    // Separate cache namespace: keep complete raw MCP JSON without replacing canonical cafeteria meals.
                    cache.save(new ScrapedMenuEntity(id,entry.toString()));
                }
            } finally { busy.release(); }
        }
        return forMeal(raw,start,end,!"cafeteria".equals(place.path("kind").asText()));
    }
    private JsonNode cached(String id) {
        return cache.findById(id).map(row->{
            try {
                var entry=mapper.readTree(row.getPayload());var result=entry.path("result");
                long seconds="unavailable".equals(result.path("status").asText()) ? 900 : 21600;
                return Instant.parse(entry.path("updatedAt").asText()).plusSeconds(seconds).isAfter(clock.instant()) ? result : null;
            } catch(RuntimeException ignored) { return null; }
        }).orElse(null);
    }
    public JsonNode availability(LocalDate date) {
        var result=mapper.createArrayNode();var seen=new HashSet<String>();
        for(var row:cache.findAll()) {
            if(!row.getId().startsWith("route-menu.v2.")) continue;
            var raw=cached(row.getId());if(raw==null || !raw.path("meals").isArray()) continue;
            String source=raw.path("url").asText("");if(source.isBlank() || !seen.add(source)) continue;
            var dishes=forMeal(raw,date.atTime(12,0).atZone(ZURICH).toInstant(),date.atTime(12,0).atZone(ZURICH).toInstant(),true);
            result.add(mapper.createObjectNode().put("websiteUrl",source).put("dishCount",dishes.path("meals").size()));
        }
        return result;
    }
    private static String source(JsonNode place) {
        String value="cafeteria".equals(place.path("kind").asText()) ? place.path("sourceUrl").asText("") : place.path("websiteUrl").asText("");
        try {
            var uri=URI.create(value);
            if("http".equalsIgnoreCase(uri.getScheme())) uri=URI.create("https"+value.substring(4));
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()==null
                && !uri.getHost().equalsIgnoreCase("www.openstreetmap.org") ? uri.toString() : "";
        } catch(IllegalArgumentException ignored) { return ""; }
    }
    private ObjectNode empty(String status,String message) {
        var result=mapper.createObjectNode().put("status",status).put("message",message);
        result.set("meals",mapper.createArrayNode());return result;
    }
    JsonNode forMeal(JsonNode raw,Instant start,Instant end) {
        return forMeal(raw,start,end,false);
    }
    JsonNode forMeal(JsonNode raw,Instant start,Instant end,boolean generalMenu) {
        var date=start.atZone(ZURICH).toLocalDate();
        var result=raw.deepCopy();var meals=mapper.createArrayNode();
        boolean closed=false;
        for(JsonNode notice:raw.path("availability")) {
            String from=notice.path("dateFrom").asText(""),to=notice.path("dateTo").asText("");
            if("closed".equals(notice.path("status").asText()) && (from.isBlank() || from.compareTo(date.toString())<=0)
                && (to.isBlank() || to.compareTo(date.toString())>=0)) closed=true;
        }
        var identities=new HashSet<String>();
        if(!closed) for(JsonNode meal:raw.path("meals")) {
            String published=meal.path("date").asText(""),name=meal.path("name").asText("").strip();
            if(!generalMenu && !published.isBlank() && !published.equals(date.toString()) || name.isBlank() || name.equalsIgnoreCase("novalue")) continue;
            try { if(!generalMenu) {
                String opens=meal.path("timeStart").asText(""),closes=meal.path("timeEnd").asText("");
                if(!opens.isBlank() && date.atTime(LocalTime.parse(opens)).atZone(ZURICH).toInstant().isAfter(start)) continue;
                if(!closes.isBlank() && date.atTime(LocalTime.parse(closes)).atZone(ZURICH).toInstant().isBefore(end)) continue;
            } } catch(DateTimeException invalidHours) { continue; }
            String identity=name.toLowerCase(Locale.ROOT)+"|"+meal.path("description").asText("")+"|"+meal.path("section").asText("");
            if(identities.add(identity)) {
                var visible=meal.deepCopy();
                if(generalMenu) ((ObjectNode)visible).remove(List.of("date","timeStart","timeEnd"));
                meals.add(visible);
            }
        }
        ((ObjectNode)result).set("meals",meals);((ObjectNode)result).put("mealDate",date.toString()).put("generalMenu",generalMenu);
        if(closed) ((ObjectNode)result).put("status","closed").put("message","The website reports this stop closed on your meal date.");
        else if(meals.isEmpty() && !result.has("message")) ((ObjectNode)result).put("message",generalMenu ? "No supported dishes were found on this restaurant's website or linked menus." : "No published dishes matched your meal date and time.");
        return result;
    }
}
