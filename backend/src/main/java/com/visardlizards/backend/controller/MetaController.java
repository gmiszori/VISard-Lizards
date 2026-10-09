package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.dto.CampusDTO;
import com.visardlizards.backend.model.dto.MetaDTO;
import com.visardlizards.backend.service.MensaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@Tag(name = "Mensas")
public class MetaController {

	private final MensaService mensaService;
	private final Clock clock;

	public MetaController(MensaService mensaService, Clock clock) {
		this.mensaService = mensaService;
		this.clock = clock;
	}

	@GetMapping("/api/meta")
	@Operation(summary = "Which days have data, which day to show", description = """
			Tells the frontend which days the backend has meals for and which day it should show by default.
			This matters because the data is a snapshot: after its last day, "today" has no meals, and the
			frontend should show the menu date instead of an empty page.

			`dataFrom`/`dataTo` are the first and last day with meals (`null` if there are none).
			""")
	@ApiResponse(responseCode = "200", description = "e.g. "
			+ "`{\"today\": \"2026-10-10\", \"menuDate\": \"2026-10-09\", \"dataFrom\": \"2026-09-28\", \"dataTo\": \"2026-10-09\"}`")
	public MetaDTO getMeta() {
		LocalDate today = LocalDate.now(clock);
		return new MetaDTO(today, mensaService.getMenuDate(today), mensaService.getFirstMealDate(),
				mensaService.getLastMealDate());
	}

	@GetMapping("/api/campuses")
	@Operation(summary = "List the campuses", description = """
			Returns the three campuses (Zentrum, Hönggerberg, Irchel) with their display name and city. Use
			the `id` as the `campus` filter of `GET /api/mensas`, for example to build a campus picker.
			""")
	@ApiResponse(responseCode = "200", description = "e.g. `[{\"id\": \"zentrum\", \"name\": \"Zentrum\", \"city\": \"Zürich\"}, ...]`")
	public List<CampusDTO> getCampuses() {
		return mensaService.getCampuses().stream()
				.map(campus -> new CampusDTO(campus.id(), campus.name(), campus.city()))
				.toList();
	}

}
