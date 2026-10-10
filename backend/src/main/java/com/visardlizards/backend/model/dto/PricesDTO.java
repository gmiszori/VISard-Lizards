package com.visardlizards.backend.model.dto;

import java.math.BigDecimal;

import org.jspecify.annotations.Nullable;

/** All prices of a meal in CHF; null where the source publishes none. */
public record PricesDTO(@Nullable BigDecimal student, @Nullable BigDecimal staff, @Nullable BigDecimal external) {
}
