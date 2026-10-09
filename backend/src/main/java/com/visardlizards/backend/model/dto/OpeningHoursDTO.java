package com.visardlizards.backend.model.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Opening hours per day, serialized directly as a map, e.g.
 * <pre>{"2026-01-01": [{"from": "09:00", "to": "12:00"}, {"from": "16:00", "to": "19:00"}]}</pre>
 */
public record OpeningHoursDTO(@JsonValue Map<LocalDate, List<OpeningTimeDTO>> days) {

	@JsonCreator(mode = JsonCreator.Mode.DELEGATING)
	public OpeningHoursDTO {
	}

}
