package com.visardlizards.backend.model.domain;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Where a mensa's live menus come from. facilityId: ETH Cookpit facility id, null for UZH mensas. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record MensaSource(@Nullable Integer facilityId) {
}
