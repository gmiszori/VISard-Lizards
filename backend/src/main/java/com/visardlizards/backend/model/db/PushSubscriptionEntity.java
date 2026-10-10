package com.visardlizards.backend.model.db;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A browser's Web Push subscription and the starred dishes it wants to hear about. The endpoint is the
 * subscription's secret address at the push service; there is no user account.
 */
@Entity
@Table(name = "push_subscription", uniqueConstraints = @UniqueConstraint(name = "uk_push_endpoint", columnNames = "endpoint"))
public class PushSubscriptionEntity {

	@Id
	@GeneratedValue
	private Long id;

	@Column(nullable = false, length = 1024)
	private String endpoint;

	@Column(nullable = false, length = 128)
	private String p256dh;

	@Column(nullable = false, length = 64)
	private String auth;

	/** en or de, for the notification text. */
	@Column(nullable = false, length = 2)
	private String language;

	/** Dish names as starred in the app. */
	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "push_subscription_dish", joinColumns = @JoinColumn(name = "subscription_id"))
	@Column(name = "dish", length = 200)
	private Set<String> dishes = new LinkedHashSet<>();

	/** Dish occurrences already announced (or already on the menu when starred): "date|normalized dish". */
	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "push_subscription_notified", joinColumns = @JoinColumn(name = "subscription_id"))
	@Column(name = "occurrence", length = 220)
	private Set<String> notified = new LinkedHashSet<>();

	@Column(nullable = false)
	private Instant updatedAt;

	protected PushSubscriptionEntity() {
	}

	public PushSubscriptionEntity(String endpoint) {
		this.endpoint = endpoint;
	}

	public Long getId() {
		return id;
	}

	public String getEndpoint() {
		return endpoint;
	}

	public String getP256dh() {
		return p256dh;
	}

	public String getAuth() {
		return auth;
	}

	public String getLanguage() {
		return language;
	}

	public Set<String> getDishes() {
		return dishes;
	}

	public Set<String> getNotified() {
		return notified;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public void update(String p256dh, String auth, String language, Set<String> dishes, Instant updatedAt) {
		this.p256dh = p256dh;
		this.auth = auth;
		this.language = language;
		this.dishes = new LinkedHashSet<>(dishes);
		this.updatedAt = updatedAt;
	}

}
