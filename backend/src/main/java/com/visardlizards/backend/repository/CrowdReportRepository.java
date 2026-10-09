package com.visardlizards.backend.repository;

import java.time.Instant;
import java.util.List;

import com.visardlizards.backend.model.domain.CrowdReport;

/** Stores crowd reports. Works with domain models; the JPA entity stays in the adapter. */
public interface CrowdReportRepository {

	void save(CrowdReport report);

	List<CrowdReport> findByMensaId(String mensaId);

	/** Reports newer than the given instant, newest first. */
	List<CrowdReport> findByMensaIdSince(String mensaId, Instant since);

}
