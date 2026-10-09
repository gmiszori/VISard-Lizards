package com.visardlizards.backend.repository;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.visardlizards.backend.model.domain.CrowdReport;
import com.visardlizards.backend.model.domain.Rating;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Exercises committed database operations, without an enclosing test transaction. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:feedback-persistence-tests;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class JpaFeedbackRepositoryTests {

    @Autowired
    private RatingRepository ratings;

    @Autowired
    private CrowdReportRepository crowds;

    @Test
    void ratingTagsSurviveStorageAndSubjectsRemainSeparate() {
        String subject = "rating-test-" + UUID.randomUUID();
        Instant timestamp = Instant.parse("2026-10-09T10:30:00Z");
        ratings.save(new Rating(subject, 4, List.of("tasty", "good_value"), timestamp));
        ratings.save(new Rating(subject + "-other", 1, List.of(), timestamp));

        List<Rating> stored = ratings.findBySubjectId(subject);
        assertEquals(1, stored.size());
        assertEquals(subject, stored.getFirst().subjectId());
        assertEquals(4, stored.getFirst().stars());
        assertEquals(Set.of("tasty", "good_value"), Set.copyOf(stored.getFirst().tags()));
        assertEquals(timestamp, stored.getFirst().createdAt());
    }

    @Test
    void recentCrowdQueryFiltersTimeAndMensaAndSortsNewestFirst() {
        String mensa = "crowd-test-" + UUID.randomUUID();
        Instant cutoff = Instant.parse("2026-10-09T10:00:00Z");
        CrowdReport older = new CrowdReport(mensa, 1, cutoff.minusSeconds(1));
        CrowdReport boundary = new CrowdReport(mensa, 2, cutoff);
        CrowdReport recent = new CrowdReport(mensa, 3, cutoff.plusSeconds(60));
        CrowdReport newest = new CrowdReport(mensa, 5, cutoff.plusSeconds(120));
        crowds.save(newest);
        crowds.save(older);
        crowds.save(recent);
        crowds.save(boundary);
        crowds.save(new CrowdReport(mensa + "-other", 4, cutoff.plusSeconds(180)));

        assertEquals(List.of(newest, recent), crowds.findByMensaIdSince(mensa, cutoff));
        assertEquals(4, crowds.findByMensaId(mensa).size());
    }
}
