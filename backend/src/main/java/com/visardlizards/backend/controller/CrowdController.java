package com.visardlizards.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.domain.CrowdHistogram;
import com.visardlizards.backend.model.domain.CrowdReport;
import com.visardlizards.backend.model.dto.CrowdHistogramDTO;
import com.visardlizards.backend.model.dto.CrowdInfoDTO;
import com.visardlizards.backend.model.dto.CrowdReportDTO;
import com.visardlizards.backend.model.dto.CrowdReportRequestDTO;
import com.visardlizards.backend.service.CrowdService;
import com.visardlizards.backend.service.MensaService;

/** "How full is it?": crowd reports and the popular-times histogram. */
@RestController
@RequestMapping("/api/mensas/{id}")
public class CrowdController {

	private final MensaService mensaService;
	private final CrowdService crowdService;

	public CrowdController(MensaService mensaService, CrowdService crowdService) {
		this.mensaService = mensaService;
		this.crowdService = crowdService;
	}

	/** Typical pattern + reports of the last 30 minutes, newest first. */
	@GetMapping("/crowd")
	public CrowdInfoDTO getCrowd(@PathVariable String id) {
		String mensaId = mensaService.getMensa(id).id();
		CrowdHistogram histogram = crowdService.getHistogram(mensaId);
		return new CrowdInfoDTO(
				new CrowdHistogramDTO(histogram.mensaId(), histogram.sufficient(), histogram.sampleSize(),
						histogram.byWeekday()),
				crowdService.getLiveReports(mensaId).stream().map(CrowdController::toDTO).toList());
	}

	/** Body {"level": 1-5}. The server stamps the time. */
	@PostMapping("/crowd-reports")
	@ResponseStatus(HttpStatus.CREATED)
	public CrowdReportDTO reportCrowd(@PathVariable String id, @RequestBody CrowdReportRequestDTO request) {
		return toDTO(crowdService.addReport(mensaService.getMensa(id).id(), request.level()));
	}

	private static CrowdReportDTO toDTO(CrowdReport report) {
		return new CrowdReportDTO(report.mensaId(), report.level(), report.timestamp());
	}

}
