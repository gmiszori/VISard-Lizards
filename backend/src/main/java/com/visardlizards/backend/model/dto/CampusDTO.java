package com.visardlizards.backend.model.dto;

/** id is the value for GET /api/mensas?campus={id}. */
public record CampusDTO(String id, String name, String city) {
}
