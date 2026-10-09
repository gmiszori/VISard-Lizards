package com.visardlizards.backend.model.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record RatingRequestDTO(
		@Schema(description = "Stars from 1 to 5", minimum = "1", maximum = "5", example = "4") int stars) {
}
