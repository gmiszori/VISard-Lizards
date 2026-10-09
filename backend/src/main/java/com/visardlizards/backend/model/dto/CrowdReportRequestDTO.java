package com.visardlizards.backend.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record CrowdReportRequestDTO(
		@Schema(description = "1 = empty, 2 = quiet, 3 = some queue, 4 = busy, 5 = packed",
				minimum = "1", maximum = "5", example = "3") int level) {
}
