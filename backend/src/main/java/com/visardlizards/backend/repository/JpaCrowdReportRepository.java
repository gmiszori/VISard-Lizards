package com.visardlizards.backend.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Repository;

import com.visardlizards.backend.model.db.CrowdReportEntity;
import com.visardlizards.backend.model.domain.CrowdReport;

@Repository
public class JpaCrowdReportRepository implements CrowdReportRepository {

	private final CrowdReportEntityRepository entities;

	public JpaCrowdReportRepository(CrowdReportEntityRepository entities) {
		this.entities = entities;
	}

	@Override
	public void save(CrowdReport report) {
		entities.save(new CrowdReportEntity(report.mensaId(), report.level(), report.timestamp()));
	}

	@Override
	public List<CrowdReport> findByMensaId(String mensaId) {
		return entities.findByMensaId(mensaId).stream().map(JpaCrowdReportRepository::toDomain).toList();
	}

	@Override
	public List<CrowdReport> findByMensaIdSince(String mensaId, Instant since) {
		return entities.findByMensaIdAndTimestampAfterOrderByTimestampDesc(mensaId, since).stream()
				.map(JpaCrowdReportRepository::toDomain)
				.toList();
	}

	private static CrowdReport toDomain(CrowdReportEntity e) {
		return new CrowdReport(e.getMensaId(), e.getLevel(), e.getTimestamp());
	}

}
