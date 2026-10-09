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
		entities.save(new RatingEntity(rating.subjectId(), rating.stars(), rating.tags(), rating.createdAt()));
	}

	@Override
	public List<Rating> findBySubjectId(String subjectId) {
		return entities.findBySubjectId(subjectId).stream()
				.map(e -> new Rating(e.getSubjectId(), e.getStars(), List.copyOf(e.getTags()), e.getCreatedAt()))
				.toList();
	}

}
