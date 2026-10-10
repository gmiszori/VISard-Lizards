package com.visardlizards.backend.model.domain;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** WGS84 position of a mensa. source: where the position comes from (e.g. "zfv.ch page"). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Coordinates(double lat, double lng, @Nullable String source) {
}
