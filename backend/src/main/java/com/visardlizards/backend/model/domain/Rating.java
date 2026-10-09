package com.visardlizards.backend.model.domain;

import java.time.Instant;
import java.util.List;

/** A star rating (1-5) of a mensa or a meal; subjectId is the mensa or meal id. */
public record Rating(String subjectId, int stars, List<String> tags, Instant createdAt) {
}
