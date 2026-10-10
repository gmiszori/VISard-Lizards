package com.visardlizards.backend.model.domain;

import java.time.Instant;
import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * A star rating (1-5) of a mensa or a meal; subjectId is the mensa or meal id. userId is the frontend's
 * anonymous user id ("anon:" + UUID) for meal ratings, null for mensa ratings. source says how the frontend
 * knows the user ate there (see {@link #weight()}), null if it did not say.
 */
public record Rating(String subjectId, int stars, List<String> tags, Instant createdAt, @Nullable String userId,
		@Nullable String source) {

	/** The user was located at the mensa. */
	public static final String SOURCE_LOCATION = "location";
	/** The user reported the crowd at the mensa, without a location. */
	public static final String SOURCE_CROWD = "crowd";
	/** The user picked the mensa when asked where they ate, without a location. */
	public static final String SOURCE_GUESS = "guess";

	/** A rating without a source. */
	public Rating(String subjectId, int stars, List<String> tags, Instant createdAt, @Nullable String userId) {
		this(subjectId, stars, tags, createdAt, userId, null);
	}

	/** A rating without a user, e.g. of a mensa. */
	public Rating(String subjectId, int stars, List<String> tags, Instant createdAt) {
		this(subjectId, stars, tags, createdAt, null, null);
	}

	/** Weight in averages: ratings without a location proof (crowd report, guess) count half. */
	public double weight() {
		return SOURCE_CROWD.equals(source) || SOURCE_GUESS.equals(source) ? 0.5 : 1.0;
	}

}
