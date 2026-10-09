package com.visardlizards.backend.model.dto;

import java.time.LocalTime;

import com.fasterxml.jackson.annotation.JsonFormat;

public record OpeningTimeDTO(
		@JsonFormat(pattern = "HH:mm") LocalTime from,
		@JsonFormat(pattern = "HH:mm") LocalTime to) {
}
