package com.visardlizards.backend.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record RatingRequestDTO(
		@Schema(description = "Stars from 1 to 5", minimum = "1", maximum = "5", example = "4") @Min(1) @Max(5) int stars) {
}
