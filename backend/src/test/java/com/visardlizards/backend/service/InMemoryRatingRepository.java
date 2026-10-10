package com.visardlizards.backend.service;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.visardlizards.backend.model.domain.Rating;
import com.visardlizards.backend.repository.RatingRepository;

/** Test double for unit tests without a database. */
class InMemoryRatingRepository implements RatingRepository {

	private final List<Rating> ratings = new CopyOnWriteArrayList<>();

	@Override
	public void save(Rating rating) {
		ratings.add(rating);
	}

	@Override
	public boolean existsBySubjectIdAndUserId(String subjectId, String userId) {
		return ratings.stream().anyMatch(r -> r.subjectId().equals(subjectId) && userId.equals(r.userId()));
	}

	@Override
	public List<Rating> findBySubjectId(String subjectId) {
		return ratings.stream().filter(rating -> rating.subjectId().equals(subjectId)).toList();
	}

}
