package com.visardlizards.backend.model.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Campus(String id, String name, String city) {
}
