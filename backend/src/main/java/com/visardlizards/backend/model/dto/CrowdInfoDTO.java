package com.visardlizards.backend.model.dto;

import java.util.List;

/** Matches CrowdInfo in frontend/MARTIN/src/lib/types.ts: typical pattern + reports of the last 30 minutes. */
public record CrowdInfoDTO(CrowdHistogramDTO histogram, List<CrowdReportDTO> live) {
}
