package com.visardlizards.backend.repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.CampusEntity;
import com.visardlizards.backend.model.db.ClosureEmbeddable;
import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.db.MensaEntity;
import com.visardlizards.backend.model.db.ServiceHoursEmbeddable;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.MensaDb;
import com.visardlizards.backend.model.domain.ServiceHours;

import jakarta.persistence.EntityManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * Fills the mensa, campus and meal tables from the bundled snapshot (resources/seed/mensa-snapshot.json)
 * when the mensa table is empty, i.e. on the first start with a new database. Existing data is never
 * touched. A live importer (ETH/UZH APIs) can later write to the same tables.
 * Regenerate the snapshot with: node backend/scripts/export-mensa-db.mjs
 */
@Component
public class MensaSnapshotImporter implements ApplicationRunner {

	static final String SNAPSHOT = "seed/mensa-snapshot.json";

	private static final Logger log = LoggerFactory.getLogger(MensaSnapshotImporter.class);

	private final MensaEntityRepository mensas;
	private final EntityManager entityManager;
	private final JsonMapper jsonMapper;

	public MensaSnapshotImporter(MensaEntityRepository mensas, EntityManager entityManager, JsonMapper jsonMapper) {
		this.mensas = mensas;
		this.entityManager = entityManager;
		this.jsonMapper = jsonMapper;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (mensas.count() > 0) {
			log.info("Mensa data already present, skipping snapshot import");
			return;
		}
		MensaDb db = readSnapshot();
		db.campuses().forEach(c -> entityManager.persist(new CampusEntity(c.id(), c.name(), c.city())));
		db.mensas().forEach(m -> entityManager.persist(toEntity(m)));
		db.meals().forEach(m -> entityManager.persist(toEntity(m)));
		log.info("Imported {} campuses, {} mensas and {} meals from {}", db.campuses().size(), db.mensas().size(),
				db.meals().size(), SNAPSHOT);
	}

	private MensaDb readSnapshot() {
		try (InputStream in = new ClassPathResource(SNAPSHOT).getInputStream()) {
			return jsonMapper.readValue(in, MensaDb.class);
		} catch (IOException e) {
			throw new UncheckedIOException("Could not read " + SNAPSHOT, e);
		}
	}

	private static MensaEntity toEntity(Mensa m) {
		List<ServiceHoursEmbeddable> serviceHours = new ArrayList<>();
		for (Map.Entry<String, List<ServiceHours>> day : m.openingHours().entrySet()) {
			for (ServiceHours h : day.getValue()) {
				serviceHours.add(new ServiceHoursEmbeddable(day.getKey(), h.service(), h.open(), h.close()));
			}
		}
		List<ClosureEmbeddable> closures = m.closures().stream()
				.map(c -> new ClosureEmbeddable(c.from(), c.to(), c.note()))
				.toList();
		return new MensaEntity(m.id(), m.name(), m.institution(), m.campusId(), m.address().street(),
				m.address().postalCode(), m.address().city(), m.address().building(), m.hasMenu(),
				m.temporarilyClosed(), serviceHours, closures);
	}

	private static MealEntity toEntity(Meal m) {
		return new MealEntity(m.id(), m.mensaId(), m.date(), m.service(), m.line(), m.kind(), m.title(), m.dietTag(),
				m.price() == null ? null : m.price().student(),
				m.price() == null ? null : m.price().staff(),
				m.price() == null ? null : m.price().external(),
				m.ecoScore(), m.climateImpact(), m.components(), m.allergens());
	}

}
