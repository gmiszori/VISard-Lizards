package com.visardlizards.backend.model.domain;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Address(String street, @Nullable String postalCode, String city, @Nullable String building) {
}
