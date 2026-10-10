package com.visardlizards.backend.model.db;

import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** One meal service window of a mensa on a weekday, e.g. mon / lunch / 11:00-14:00. */
@Embeddable
public class ServiceHoursEmbeddable {

	/** mon, tue, wed, thu, fri, sat, sun */
	@Column(nullable = false, length = 3)
	private String weekday;

	/** lunch or dinner */
	@Column(nullable = false)
	private String service;

	@Column(name = "open_time", nullable = false)
	private LocalTime openTime;

	@Column(name = "close_time", nullable = false)
	private LocalTime closeTime;

	protected ServiceHoursEmbeddable() {
	}

	public ServiceHoursEmbeddable(String weekday, String service, LocalTime openTime, LocalTime closeTime) {
		this.weekday = weekday;
		this.service = service;
		this.openTime = openTime;
		this.closeTime = closeTime;
	}

	public String getWeekday() {
		return weekday;
	}

	public String getService() {
		return service;
	}

	public LocalTime getOpenTime() {
		return openTime;
	}

	public LocalTime getCloseTime() {
		return closeTime;
	}

}
