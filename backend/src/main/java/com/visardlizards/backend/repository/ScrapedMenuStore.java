package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.visardlizards.backend.service.MealEmbeddingService;

@Service
public class ScrapedMenuStore {
    private final ScrapedMenuEntityRepository raw;
    private final MealEntityRepository meals;
    private final JsonMapper mapper;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private MealEmbeddingService embeddingService;
    public ScrapedMenuStore(ScrapedMenuEntityRepository raw, MealEntityRepository meals, JsonMapper mapper) {
        this.raw=raw; this.meals=meals; this.mapper=mapper;
    }
    public List<JsonNode> all() { return raw.findAll().stream().map(e -> mapper.readTree(e.getPayload())).filter(e -> ExcludedMensas.allowed(e.path("id").asText())).toList(); }
    public JsonNode get(String id) { return ExcludedMensas.allowed(id) ? raw.findById(id).map(e -> mapper.readTree(e.getPayload())).orElse(null) : null; }
    @Transactional
    public void save(JsonNode entry) {
        String id=entry.path("id").asText();
        if(!ExcludedMensas.allowed(id)) return;
        raw.save(new ScrapedMenuEntity(id,entry.toString()));
        if(entry.has("result") && !entry.path("stale").asBoolean()) {
            LocalDate today=LocalDate.now(ZoneId.of("Europe/Zurich"));
            // Replace only our own current/future projection; never remove upstream or historical meals.
            var existing=meals.findByMensaIdAndDateBetweenOrderByDateAsc(id,today,LocalDate.of(9999,12,31));
            meals.deleteAll(existing.stream().filter(m -> m.getId().startsWith("mcp.")).toList());
            meals.flush();
            project(entry,today,today.plusDays(14));
        }
    }
    @Transactional
    public void projectCached(String id, LocalDate start, LocalDate end) {
        JsonNode entry=get(id);
        if(entry!=null && entry.has("result")) project(entry,start,end);
    }
    private void project(JsonNode entry, LocalDate start, LocalDate end) {
        String venue=entry.path("id").asText();
        Set<LocalDate> upstream=new HashSet<>();
        for(var row:meals.findByMensaIdAndDateBetweenOrderByDateAsc(venue,start,end))
            if(!row.getId().startsWith("mcp.") && !row.getTitle().isBlank() && !row.getTitle().equalsIgnoreCase("novalue")) upstream.add(row.getDate());
        var rows=new LinkedHashMap<String,MealEntity>();
        for(JsonNode tool:entry.path("result").path("toolResults")) {
            if(!tool.path("name").asText().equals("scrape_meals")) continue;
            for(JsonNode meal:tool.path("data").path("meals")) {
                String title=meal.path("name").asText("").strip();
                if(title.isEmpty() || title.equalsIgnoreCase("novalue")) continue;
                String published=meal.path("date").asText("");
                for(LocalDate day=start;!day.isAfter(end);day=day.plusDays(1)) {
                    if(upstream.contains(day) || closed(entry,day)) continue;
                    if(!published.isBlank() && !published.equals(day.toString())) continue;
                    String service=meal.path("service").asText("lunch");
                    if(!Set.of("lunch","dinner").contains(service)) service="lunch";
                    String identity=venue+"|"+day+"|"+service+"|"+title.toLowerCase(Locale.ROOT)+"|"+meal.path("description").asText("");
                    String id="mcp."+UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8));
                    var labels=strings(meal.path("dietaryLabels"));
                    String diet=labels.stream().anyMatch(s -> s.toLowerCase(Locale.ROOT).contains("vegan")) ? "vegan" :
                        labels.stream().anyMatch(s -> s.toLowerCase(Locale.ROOT).contains("vegetar")) ? "vegetarian" : "unknown";
                    List<String> components=new ArrayList<>();
                    if(meal.path("description").isTextual()) components.add(limit(meal.path("description").asText(),500));
                    if(meal.path("sourceUrl").isTextual()) components.add("Source: "+limit(meal.path("sourceUrl").asText(),490));
                    if(published.isBlank()) components.add("Every day");
                    String line=meal.path("section").asText("Website menu");
                    if(meal.path("sourceUrl").asText("").toLowerCase(Locale.ROOT).contains("catering")) { line="Catering"; components.add("Catering offer"); }
                    var row=new MealEntity(id,venue,day,service,limit(line,250),
                        "main",limit(title,500),diet,price(meal,"student"),price(meal,"staff"),price(meal,"external"),
                        null,null,components,strings(meal.path("allergens")));
                    row.setTraceAllergens(traceAllergens(meal));
                    rows.putIfAbsent(id,row);
                }
            }
        }
        if (embeddingService != null) embeddingService.fill(new ArrayList<>(rows.values()));
        meals.saveAll(rows.values());
    }
    private static boolean closed(JsonNode entry, LocalDate date) {
        for(JsonNode tool:entry.path("result").path("toolResults")) for(JsonNode closure:tool.path("data").path("availability")) {
            String from=closure.path("dateFrom").asText(""); String to=closure.path("dateTo").asText("");
            if((from.isBlank() || from.compareTo(date.toString())<=0) && (to.isBlank() || to.compareTo(date.toString())>=0)) return true;
        }
        return false;
    }
    private static List<String> strings(JsonNode values) {
        var result=new ArrayList<String>(); for(JsonNode value:values) if(value.isTextual()) result.add(limit(value.asText(),250)); return result;
    }
    private static List<String> traceAllergens(JsonNode meal) {
        if(meal.has("traceAllergens")) return strings(meal.path("traceAllergens"));
        // Older cached FOOD2050 detail responses already retain the full dish object.
        var result=new ArrayList<String>();
        for(JsonNode value:meal.path("details").path("dish").path("traceAllergens")) {
            JsonNode allergen=value.path("allergen");
            String label=allergen.path("name").asText(allergen.path("externalId").asText(""));
            if(!label.isBlank()) result.add(limit(label,250));
        }
        return result;
    }
    private static String limit(String value,int size) { return value.substring(0,Math.min(value.length(),size)); }
    private static BigDecimal price(JsonNode meal,String group) {
        JsonNode prices=meal.path("prices");
        for(JsonNode value:prices) {
            String category=value.path("customerGroup").asText("").toLowerCase(Locale.ROOT);
            boolean matches=switch(group) {
                case "student" -> category.contains("student") || category.contains("studier");
                case "staff" -> category.contains("staff") || category.contains("mitarbeit") || category.contains("employee");
                default -> category.contains("extern") || category.contains("gast") || category.contains("guest");
            };
            if(matches) return amount(value);
        }
        // A single general CHF price applies to all customer groups.
        if(prices.size()==1 && prices.get(0).path("customerGroup").asText("").isBlank()) return amount(prices.get(0));
        return amount(meal.path("price"));
    }
    private static BigDecimal amount(JsonNode price) {
        if(!price.path("currency").asText("CHF").equals("CHF")) return null;
        try { var amount=new BigDecimal(price.path("amount").asText()); return amount.signum()>=0 && amount.compareTo(new BigDecimal("9999.99"))<=0 ? amount : null; }
        catch(NumberFormatException ex) { return null; }
    }
}
