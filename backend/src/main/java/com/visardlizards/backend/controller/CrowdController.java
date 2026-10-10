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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/mensas/{id}")
@Tag(name = "Crowd", description = "How full a mensa is: live user reports and the popular-times chart")
public class CrowdController {

	private final MensaService mensaService;
	private final CrowdService crowdService;

	public CrowdController(MensaService mensaService, CrowdService crowdService) {
		this.mensaService = mensaService;
		this.crowdService = crowdService;
	}

	@GetMapping("/crowd")
	@Operation(summary = "How full a mensa is now and usually", description = """
			Says how full a mensa is, based on what users reported. `live` holds the reports of the last 30
			minutes, newest first: show them as "right now". `histogram` is the "popular times" chart: for
			each weekday and hour, how full the mensa usually is, from all reports ever made.

			- `byWeekday` has the keys `mon` to `sun`, each with 24 values (index = hour of day in Zurich,
			  0-23). A value is the average reported level of that hour, scaled to 0-100 (level 1 = 0,
			  level 5 = 100); hours without reports are 0.
			- With fewer than **10** reports the chart would be meaningless: then `sufficient` is `false` and
			  `byWeekday` is left out. `sampleSize` is always the number of reports.
			""")
	@ApiResponse(responseCode = "200", description = "Histogram and live reports")
	@ApiResponse(responseCode = "404", description = "Unknown mensa")
	public CrowdInfoDTO getCrowd(@Parameter(description = "Mensa id, e.g. `polyterrasse`") @PathVariable String id) {
		String mensaId = mensaService.getMensa(id).id();
		CrowdHistogram histogram = crowdService.getHistogram(mensaId);
		return new CrowdInfoDTO(
				new CrowdHistogramDTO(histogram.mensaId(), histogram.sufficient(), histogram.sampleSize(),
						histogram.byWeekday()),
				crowdService.getLiveReports(mensaId).stream().map(CrowdController::toDTO).toList());
	}

	@PostMapping("/crowd-reports")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Report how full a mensa is", description = """
			Saves a user's report of how full a mensa is right now. The server sets the time, so clients
			cannot backdate reports. Each client (IP address) can report a mensa once every 5 minutes. The report immediately appears in `live` of
			`GET /api/mensas/{id}/crowd` and counts towards the histogram.

			Levels: 1 = empty, 2 = quiet, 3 = some queue, 4 = busy, 5 = packed.
			""")
	@ApiResponse(responseCode = "201", description = "The stored report")
	@ApiResponse(responseCode = "400", description = "Level outside 1-5 or invalid body")
	@ApiResponse(responseCode = "404", description = "Unknown mensa")
	@ApiResponse(responseCode = "429", description = "This client already reported this mensa in the last 5 minutes (see `Retry-After`)")
	public CrowdReportDTO reportCrowd(@Parameter(description = "Mensa id, e.g. `polyterrasse`") @PathVariable String id,
			@Valid @RequestBody CrowdReportRequestDTO request) {
		return toDTO(crowdService.addReport(mensaService.getMensa(id).id(), request.level()));
	}

	private static CrowdReportDTO toDTO(CrowdReport report) {
		return new CrowdReportDTO(report.mensaId(), report.level(), report.timestamp());
	}

}
