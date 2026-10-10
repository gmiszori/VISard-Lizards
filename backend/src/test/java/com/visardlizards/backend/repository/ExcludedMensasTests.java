package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.*;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ExcludedMensasTests {
    @Autowired EntityManager em;
    @Autowired MensaSnapshotImporter importer;
    @Autowired MensaRepository publicData;
    @Autowired ScrapedMenuStore store;
    @Autowired JsonMapper mapper;
    @Autowired MockMvc mvc;

    @Test void oldRecordsAreHiddenPurgedAndCannotBeReimported() throws Exception {
        var date = LocalDate.of(2026, 10, 12);
        for (String id : ExcludedMensas.IDS) {
            em.persist(new MensaEntity(id, id, "ETH", "eth-hoenggerberg", "Street", "8093", "Zurich",
                    null, null, null, null, true, false, null, List.of(), List.of()));
            em.persist(new MealEntity("old." + id, id, date, "lunch", "Main", "main", "Old lunch", "vegan",
                    null, null, null, null, null, List.of("Rice"), List.of("milk")));
            em.persist(new ScrapedMenuEntity(id, "{\"id\":\"" + id + "\",\"result\":{}}"));
            em.persist(new RatingEntity("old." + id, 4, List.of("good"), Instant.now(), "test", null));
            em.persist(new CrowdReportEntity(id, 1, Instant.now()));
        }
        em.flush();
        assertThat(publicData.findAllMensas()).noneMatch(m -> ExcludedMensas.IDS.contains(m.id()));
        assertThat(publicData.findMealsOn(date)).noneMatch(m -> ExcludedMensas.IDS.contains(m.mensaId()));
        assertThat(store.all()).noneMatch(e -> ExcludedMensas.IDS.contains(e.path("id").asText()));
        for (String id : ExcludedMensas.IDS) {
            mvc.perform(get("/api/mensas/" + id)).andExpect(status().isNotFound());
            mvc.perform(get("/api/meals/old." + id)).andExpect(status().isNotFound());
        }
        importer.run(new DefaultApplicationArguments());
        em.clear();
        for (String id : ExcludedMensas.IDS) {
            assertThat(em.find(MensaEntity.class, id)).isNull();
            assertThat(em.find(MealEntity.class, "old." + id)).isNull();
            assertThat(em.find(ScrapedMenuEntity.class, id)).isNull();
            store.save(mapper.readTree("{\"id\":\"" + id + "\",\"result\":{\"toolResults\":[]}}"));
            publicData.replaceMeals(id, date, date, List.of(new com.visardlizards.backend.model.domain.Meal(
                    "new." + id, id, date, "lunch", "Main", "main", "New lunch", List.of(), "vegan", null, List.of(), null, null)));
            em.flush();
            assertThat(em.find(MealEntity.class, "new." + id)).isNull();
            assertThat(store.get(id)).isNull();
            assertThat(publicData.findMeals(id, date, date)).isEmpty();
        }
        assertThat(em.createQuery("select r from RatingEntity r where r.userId = 'test'", RatingEntity.class).getResultList()).isEmpty();
        assertThat(em.createQuery("select c from CrowdReportEntity c where c.mensaId in :ids", CrowdReportEntity.class)
                .setParameter("ids", ExcludedMensas.IDS).getResultList()).isEmpty();
    }
}
