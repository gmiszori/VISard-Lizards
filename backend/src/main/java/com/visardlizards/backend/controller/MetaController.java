package com.visardlizards.backend.controller;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.dto.CampusDTO;
import com.visardlizards.backend.model.dto.MetaDTO;
import com.visardlizards.backend.service.MensaService;

@RestController
public class MetaController {

	private final MensaService mensaService;
	private final Clock clock;

	public MetaController(MensaService mensaService, Clock clock) {
		this.mensaService = mensaService;
		this.clock = clock;
	}

	/** Which days have data, and which day the frontend should show by default. */
	@GetMapping("/api/meta")
	public MetaDTO getMeta() {
		LocalDate today = LocalDate.now(clock);
		return new MetaDTO(today, mensaService.getMenuDate(today), mensaService.getFirstMealDate(),
				mensaService.getLastMealDate());
	}

	/** Campuses, for the campus filter of GET /api/mensas. */
	@GetMapping("/api/campuses")
	public List<CampusDTO> getCampuses() {
		return mensaService.getCampuses().stream()
				.map(campus -> new CampusDTO(campus.id(), campus.name(), campus.city()))
				.toList();
	}

}
