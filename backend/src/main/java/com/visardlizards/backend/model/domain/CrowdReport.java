package com.visardlizards.backend.model.domain;

import java.time.Instant;

/** A user report of how full a mensa is. level: 1 Empty, 2 Quiet, 3 Some queue, 4 Busy, 5 Packed. */
public record CrowdReport(String mensaId, int level, Instant timestamp) {
}
