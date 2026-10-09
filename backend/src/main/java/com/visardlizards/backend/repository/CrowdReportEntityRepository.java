package com.visardlizards.backend.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.visardlizards.backend.model.db.CrowdReportEntity;

interface CrowdReportEntityRepository extends JpaRepository<CrowdReportEntity, Long> {

	List<CrowdReportEntity> findByMensaId(String mensaId);

	List<CrowdReportEntity> findByMensaIdAndTimestampAfterOrderByTimestampDesc(String mensaId, Instant since);

}
