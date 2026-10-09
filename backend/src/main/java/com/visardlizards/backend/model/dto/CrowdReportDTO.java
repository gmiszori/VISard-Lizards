package com.visardlizards.backend.model.dto;

import java.time.Instant;

public record CrowdReportDTO(String mensaId, int level, Instant timestamp) {
}
