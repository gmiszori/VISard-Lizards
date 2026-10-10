package com.visardlizards.backend.repository;

import java.util.List;

import com.visardlizards.backend.model.domain.Rating;

/** Stores ratings of mensas and meals. Works with domain models; the JPA entity stays in the adapter. */
public interface RatingRepository {

	void save(Rating rating);

	List<Rating> findBySubjectId(String subjectId);

	/** Whether this user already rated this mensa or meal. */
	boolean existsBySubjectIdAndUserId(String subjectId, String userId);

	/** Deletes this user's rating of this mensa or meal; false if there was none. */
	boolean deleteBySubjectIdAndUserId(String subjectId, String userId);

}
