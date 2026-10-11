package com.visardlizards.backend.repository;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.domain.CrowdReport;
import com.visardlizards.backend.service.MensaService;
import com.visardlizards.backend.service.RatingService;
import com.visardlizards.backend.model.domain.Rating;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.assertj.core.api.Assertions.assertThat;

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

    @Autowired
    private MealEntityRepository meals;

    @Autowired
    private RatingEntityRepository ratingEntities;

    @Autowired
    private RatingService ratingService;

    @Autowired
    private MensaService mensaService;

    @Test
    void mensaAverageCombinesDirectAndUserMealRatingsWithTheirPersistedWeights() {
        String mensa = "combined-test-" + UUID.randomUUID();
        String meal = "unrelated-meal-id-" + UUID.randomUUID();
        String secondMeal = "another-meal-id-" + UUID.randomUUID();
        String otherMeal = mensa + ".other-canteen-meal";
        saveMeal(meal, mensa);
        saveMeal(secondMeal, mensa);
        saveMeal(otherMeal, mensa + "-other");
        ratingService.addRating(mensa, 5);
        ratingService.addUserRating(meal, "anon:a", 1, List.of(), Rating.SOURCE_LOCATION);
        ratingService.addUserRating(meal, "anon:b", 1, List.of(), Rating.SOURCE_CROWD);
        ratingService.addUserRating(meal, "anon:c", 1, List.of(), Rating.SOURCE_GUESS);
        ratingService.addUserRating(secondMeal, "anon:a", 5, List.of());
        ratingService.addRating(meal, 5);
        ratingService.addUserRating(otherMeal, "anon:a", 5, List.of());
        ratingService.addUserRating(mensa + ".missing-meal", "anon:a", 5, List.of());

        long storedCount = ratingEntities.count();
        RatingService reloaded = new RatingService(ratings, Clock.systemUTC());
        assertThat(reloaded.getMensaAverage(mensa)).isEqualByComparingTo("3.0");
        assertThat(mensaService.getAverageRating(mensa)).isEqualByComparingTo("3.0");
        assertThat(reloaded.getAverage(meal)).isEqualByComparingTo("2.3");
        assertThat(ratings.findByMensaId(mensa)).hasSize(5);
        assertThat(ratings.findBySubjectId(mensa)).hasSize(1);
        assertThat(ratings.findBySubjectId(meal)).extracting(Rating::source)
                .containsExactlyInAnyOrder(Rating.SOURCE_LOCATION, Rating.SOURCE_CROWD, Rating.SOURCE_GUESS, null);
        assertThat(ratingEntities.count()).isEqualTo(storedCount);
    }

    @Test
    void undoRemovesMealContributionFromPersistedMensaAverageWithoutExtraRatings() {
        String mensa = "undo-test-" + UUID.randomUUID();
        String meal = "undo-meal-" + UUID.randomUUID();
        saveMeal(meal, mensa);
        assertThat(mensaService.getAverageRating(mensa)).isNull();
        long initialCount = ratingEntities.count();
        ratingService.addUserRating(meal, "anon:a", 2, List.of("tasty"));
        assertThat(mensaService.getAverageRating(mensa)).isEqualByComparingTo("2.0");
        assertThat(ratings.findBySubjectId(mensa)).isEmpty();
        assertThat(ratingEntities.count()).isEqualTo(initialCount + 1);

        ratingService.removeUserRating(meal, "anon:a");
        RatingService reloaded = new RatingService(ratings, Clock.systemUTC());
        assertThat(reloaded.getMensaAverage(mensa)).isNull();
        assertThat(reloaded.getAverage(meal)).isNull();
        assertThat(ratingEntities.count()).isEqualTo(initialCount);

        ratingService.addRating(mensa, 4);
        ratingService.addUserRating(meal, "anon:a", 2, List.of());
        assertThat(mensaService.getAverageRating(mensa)).isEqualByComparingTo("3.0");
        ratingService.removeUserRating(meal, "anon:a");
        assertThat(reloaded.getMensaAverage(mensa)).isEqualByComparingTo("4.0");
        assertThat(ratings.findBySubjectId(meal)).isEmpty();
        assertThat(ratingEntities.count()).isEqualTo(initialCount + 1);
    }

    private void saveMeal(String id, String mensaId) {
        meals.saveAndFlush(new MealEntity(id, mensaId, LocalDate.of(2026, 10, 9), "lunch", null,
                "main", "Test meal", "vegan", null, null, null, null, null, List.of(), List.of()));
    }

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
