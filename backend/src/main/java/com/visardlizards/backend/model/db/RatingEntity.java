package com.visardlizards.backend.model.db;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "rating", indexes = @Index(columnList = "subjectId"),
		uniqueConstraints = @UniqueConstraint(name = "uk_rating_subject_user", columnNames = { "subjectId", "userId" }))
public class RatingEntity {

	@Id
	@GeneratedValue
	private Long id;

	@Column(nullable = false)
	private String subjectId;

	private int stars;

	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "rating_tag", joinColumns = @JoinColumn(name = "rating_id"))
	@Column(name = "tag")
	private List<String> tags = new ArrayList<>();

	@Column(nullable = false)
	private Instant createdAt;

	/** Anonymous frontend user id for meal ratings (one rating per user and meal), null for mensa ratings. */
	@Column(length = 80)
	private String userId;

	/** How the frontend knows the user ate there: location, crowd or guess; null if unknown. */
	@Column(length = 16)
	private String source;

	protected RatingEntity() {
	}

	public RatingEntity(String subjectId, int stars, List<String> tags, Instant createdAt, String userId,
			String source) {
		this.subjectId = subjectId;
		this.source = source;
		this.stars = stars;
		this.tags = new ArrayList<>(tags);
		this.createdAt = createdAt;
		this.userId = userId;
	}

	public String getSubjectId() {
		return subjectId;
	}

	public int getStars() {
		return stars;
	}

	public List<String> getTags() {
		return tags;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public String getUserId() {
		return userId;
	}

	public String getSource() {
		return source;
	}

}
