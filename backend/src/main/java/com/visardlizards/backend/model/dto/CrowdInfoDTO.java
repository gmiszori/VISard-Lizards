package com.visardlizards.backend.model.dto;

import java.util.List;

/** Typical pattern + reports of the last 30 minutes. */
public record CrowdInfoDTO(CrowdHistogramDTO histogram, List<CrowdReportDTO> live) {
}
