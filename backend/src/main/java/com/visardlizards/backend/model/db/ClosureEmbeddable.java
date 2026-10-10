package com.visardlizards.backend.model.db;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** A period (inclusive) in which a mensa is closed, e.g. company holidays. */
@Embeddable
public class ClosureEmbeddable {

	@Column(name = "from_date", nullable = false)
	private LocalDate fromDate;

	@Column(name = "to_date", nullable = false)
	private LocalDate toDate;

	private String note;

	protected ClosureEmbeddable() {
	}

	public ClosureEmbeddable(LocalDate fromDate, LocalDate toDate, String note) {
		this.fromDate = fromDate;
		this.toDate = toDate;
		this.note = note;
	}

	public LocalDate getFromDate() {
		return fromDate;
	}

	public LocalDate getToDate() {
		return toDate;
	}

	public String getNote() {
		return note;
	}

}
