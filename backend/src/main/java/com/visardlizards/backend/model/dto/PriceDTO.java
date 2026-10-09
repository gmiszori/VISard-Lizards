package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;

import org.jspecify.annotations.Nullable;

public record PriceDTO(@Nullable BigDecimal price, @Nullable String cat) {
}
