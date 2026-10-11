package com.visardlizards.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.ConflictException;
import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.domain.Rating;
import com.visardlizards.backend.repository.RatingRepository;

/**
 * Star ratings (and optional tags) of mensas and meals.
 * Mensa ids and meal ids never collide, so one store serves both.
 */
@Service
public class RatingService {

	private final RatingRepository ratingRepository;
	private final Clock clock;

	public RatingService(RatingRepository ratingRepository, Clock clock) {
		this.ratingRepository = ratingRepository;
		this.clock = clock;
	}

	public void addRating(String subjectId, int stars) {
		addRating(subjectId, stars, List.of());
	}

	public void addRating(String subjectId, int stars, Collection<String> tags) {
		if (stars < 1 || stars > 5) {
			throw new IllegalArgumentException("stars must be between 1 and 5, was " + stars);
		}
		ratingRepository.save(new Rating(subjectId, stars, List.copyOf(tags), clock.instant()));
	}

	/**
	 * A user's rating, e.g. of a meal. Each user can rate each subject once.
	 *
	 * @throws ConflictException if this user already rated this subject
	 */
	public Rating addUserRating(String subjectId, String userId, int stars, Collection<String> tags) {
		return addUserRating(subjectId, userId, stars, tags, null);
	}

	/**
	 * A user's rating with its source ({@link Rating#SOURCE_LOCATION}, {@link Rating#SOURCE_CROWD},
	 * {@link Rating#SOURCE_GUESS} or null), which sets its weight in the average.
	 *
	 * @throws ConflictException if this user already rated this subject
	 */
	public Rating addUserRating(String subjectId, String userId, int stars, Collection<String> tags,
			@Nullable String source) {
		if (stars < 1 || stars > 5) {
			throw new IllegalArgumentException("stars must be between 1 and 5, was " + stars);
		}
		if (ratingRepository.existsBySubjectIdAndUserId(subjectId, userId)) {
			throw new ConflictException("You already rated this.");
		}
		Rating rating = new Rating(subjectId, stars, List.copyOf(tags), clock.instant(), userId, source);
		ratingRepository.save(rating);
		return rating;
	}

	/**
	 * Takes back a user's rating, e.g. "undo" right after rating a meal.
	 *
	 * @throws NotFoundException if this user has no rating of this subject
	 */
	public void removeUserRating(String subjectId, String userId) {
		if (!ratingRepository.deleteBySubjectIdAndUserId(subjectId, userId)) {
			throw new NotFoundException("You have not rated this.");
		}
	}

	/**
	 * Weighted average rounded to one decimal, or null if there are no ratings yet.
	 * Crowd and guess ratings count half (see {@link Rating#weight()}).
	 */
	public @Nullable BigDecimal getAverage(String subjectId) {
		return average(ratingRepository.findBySubjectId(subjectId));
	}

	/** Weighted average of direct mensa ratings and user ratings of meals belonging to it. */
	public @Nullable BigDecimal getMensaAverage(String mensaId) {
		return average(ratingRepository.findByMensaId(mensaId));
	}

	private @Nullable BigDecimal average(List<Rating> ratings) {
		if (ratings.isEmpty()) {
			return null;
		}
		double weights = ratings.stream().mapToDouble(Rating::weight).sum();
		double average = ratings.stream().mapToDouble(r -> r.stars() * r.weight()).sum() / weights;
		return BigDecimal.valueOf(average).setScale(1, RoundingMode.HALF_UP);
	}

	/** How often each tag was given, sorted by tag. */
	public Map<String, Integer> getTagCounts(String subjectId) {
		Map<String, Integer> counts = new TreeMap<>();
		for (Rating rating : ratingRepository.findBySubjectId(subjectId)) {
			for (String tag : rating.tags()) {
				counts.merge(tag, 1, Integer::sum);
			}
		}
		return counts;
	}

}
