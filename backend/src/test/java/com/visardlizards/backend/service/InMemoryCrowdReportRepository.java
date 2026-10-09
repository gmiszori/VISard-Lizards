package com.visardlizards.backend.service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.visardlizards.backend.model.domain.CrowdReport;
import com.visardlizards.backend.repository.CrowdReportRepository;

/** Test double for unit tests without a database. */
class InMemoryCrowdReportRepository implements CrowdReportRepository {

	private final List<CrowdReport> reports = new CopyOnWriteArrayList<>();

	@Override
	public void save(CrowdReport report) {
		reports.add(report);
	}

	@Override
	public List<CrowdReport> findByMensaId(String mensaId) {
		return reports.stream().filter(report -> report.mensaId().equals(mensaId)).toList();
	}

	@Override
	public List<CrowdReport> findByMensaIdSince(String mensaId, Instant since) {
		return findByMensaId(mensaId).stream()
				.filter(report -> report.timestamp().isAfter(since))
				.sorted(Comparator.comparing(CrowdReport::timestamp).reversed())
				.toList();
	}

}
