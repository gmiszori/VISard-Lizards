package com.visardlizards.backend.model.db;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "crowd_report", indexes = @Index(columnList = "mensaId, timestamp"))
public class CrowdReportEntity {

	@Id
	@GeneratedValue
	private Long id;

	@Column(nullable = false)
	private String mensaId;

	private int level;

	@Column(nullable = false)
	private Instant timestamp;

	protected CrowdReportEntity() {
	}

	public CrowdReportEntity(String mensaId, int level, Instant timestamp) {
		this.mensaId = mensaId;
		this.level = level;
		this.timestamp = timestamp;
	}

	public String getMensaId() {
		return mensaId;
	}

	public int getLevel() {
		return level;
	}

	public Instant getTimestamp() {
		return timestamp;
	}

}
