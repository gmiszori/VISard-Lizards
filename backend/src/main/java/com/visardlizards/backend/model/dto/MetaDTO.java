package com.visardlizards.backend.model.dto;

import java.time.LocalDate;

import org.jspecify.annotations.Nullable;

/**
 * today: today in Zurich. menuDate: the day shown by default (today, or the latest earlier day with data).
 * dataFrom/dataTo: range of days that have meals.
 */
public record MetaDTO(LocalDate today, LocalDate menuDate, @Nullable LocalDate dataFrom, @Nullable LocalDate dataTo) {
}
