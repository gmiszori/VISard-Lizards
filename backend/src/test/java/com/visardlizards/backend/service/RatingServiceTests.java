package com.visardlizards.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class RatingServiceTests {

	private final RatingService ratingService = new RatingService();

	@Test
	void averageIsNullWithoutRatings() {
		assertThat(ratingService.getAverage("polyterrasse")).isNull();
	}

	@Test
	void averageIsRoundedToOneDecimal() {
		ratingService.addRating("polyterrasse", 5);
		ratingService.addRating("polyterrasse", 4);
		ratingService.addRating("polyterrasse", 4);
		assertThat(ratingService.getAverage("polyterrasse")).isEqualByComparingTo(new BigDecimal("4.3"));
	}

	@Test
	void rejectsStarsOutsideOneToFive() {
		assertThatThrownBy(() -> ratingService.addRating("polyterrasse", 0)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> ratingService.addRating("polyterrasse", 6)).isInstanceOf(IllegalArgumentException.class);
	}

}
