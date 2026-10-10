package com.visardlizards.backend.model.domain;

import java.time.Instant;
import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * A star rating (1-5) of a mensa or a meal; subjectId is the mensa or meal id. userId is the frontend's
 * anonymous user id ("anon:" + UUID) for meal ratings, null for mensa ratings.
 */
public record Rating(String subjectId, int stars, List<String> tags, Instant createdAt, @Nullable String userId) {

	/** A rating without a user, e.g. of a mensa. */
	public Rating(String subjectId, int stars, List<String> tags, Instant createdAt) {
		this(subjectId, stars, tags, createdAt, null);
	}

}
