package com.visardlizards.backend.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.visardlizards.backend.model.db.RatingEntity;
import com.visardlizards.backend.model.domain.Rating;

@Repository
public class JpaRatingRepository implements RatingRepository {

	private final RatingEntityRepository entities;

	public JpaRatingRepository(RatingEntityRepository entities) {
		this.entities = entities;
	}

	@Override
	public void save(Rating rating) {
		entities.saveAndFlush(new RatingEntity(rating.subjectId(), rating.stars(), rating.tags(), rating.createdAt(),
				rating.userId(), rating.source()));
	}

	@Override
	public boolean existsBySubjectIdAndUserId(String subjectId, String userId) {
		return entities.existsBySubjectIdAndUserId(subjectId, userId);
	}

	@Override
	public boolean deleteBySubjectIdAndUserId(String subjectId, String userId) {
		return entities.findBySubjectIdAndUserId(subjectId, userId).map(entity -> {
			entities.delete(entity);
			entities.flush();
			return true;
		}).orElse(false);
	}

	@Override
	public List<Rating> findBySubjectId(String subjectId) {
		return entities.findBySubjectId(subjectId).stream()
				.map(e -> new Rating(e.getSubjectId(), e.getStars(), List.copyOf(e.getTags()), e.getCreatedAt(),
						e.getUserId(), e.getSource()))
				.toList();
	}

}
