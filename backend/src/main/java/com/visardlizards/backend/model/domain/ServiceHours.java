package com.visardlizards.backend.model.domain;

import java.time.LocalTime;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** One meal service window, e.g. lunch 11:00-14:00. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ServiceHours(String service, LocalTime open, LocalTime close) {
}
