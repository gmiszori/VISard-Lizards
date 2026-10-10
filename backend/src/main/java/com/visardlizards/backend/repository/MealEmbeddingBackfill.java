package com.visardlizards.backend.repository;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.service.MealEmbeddingService;

/** Startup migration for legacy rows. It is idempotent and retries missing rows on the next start. */
@Component
public class MealEmbeddingBackfill {
    private static final Logger log = LoggerFactory.getLogger(MealEmbeddingBackfill.class);
    private final MealEntityRepository meals;
    private final MealEmbeddingService embeddings;

    public MealEmbeddingBackfill(MealEntityRepository meals, MealEmbeddingService embeddings) {
        this.meals = meals;
        this.embeddings = embeddings;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfill() {
        int filled = 0;
        while (true) {
            List<MealEntity> missing = meals.findBySemanticEmbeddingIsNull(PageRequest.of(0, 100));
            if (missing.isEmpty()) break;
            embeddings.fill(missing);
            List<MealEntity> completed = missing.stream().filter(m -> m.getSemanticEmbedding() != null).toList();
            if (completed.isEmpty()) break;
            meals.saveAll(completed);
            filled += completed.size();
            if (completed.size() < missing.size()) break;
        }
        if (filled > 0) log.info("Backfilled semantic embeddings for {} meals", filled);
    }
}
