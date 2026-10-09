package com.visardlizards.backend.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record CrowdReportRequestDTO(
		@Schema(description = "1 = empty, 2 = quiet, 3 = some queue, 4 = busy, 5 = packed",
				minimum = "1", maximum = "5", example = "3") @Min(1) @Max(5) int level) {
}
