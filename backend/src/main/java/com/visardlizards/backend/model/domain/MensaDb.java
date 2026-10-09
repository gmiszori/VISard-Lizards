package com.visardlizards.backend.model.domain;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Root of the seed snapshot resources/seed/mensa-snapshot.json (exported from the frontend's canteens.ts). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record MensaDb(List<Campus> campuses, List<Mensa> mensas, List<Meal> meals) {
}
