package com.visardlizards.backend.repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashMap;
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
import com.visardlizards.backend.model.domain.Coordinates;
import com.visardlizards.backend.model.domain.Campus;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.MensaDb;
import com.visardlizards.backend.model.domain.ServiceHours;
import com.visardlizards.backend.service.MealEmbeddingService;

import jakarta.persistence.EntityManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * Fills the mensa, campus and meal tables from the bundled snapshot (resources/seed/mensa-snapshot.json)
 * on first start, and registers newly added campuses/mensas on later starts without replacing existing
 * records or meals. Missing facility ids and coordinates are backfilled from the snapshot.
 * A live importer (ETH/UZH APIs) can later write to the same tables.
 * Regenerate the snapshot with: node backend/scripts/export-mensa-db.mjs
 */
@Component
public class MensaSnapshotImporter implements ApplicationRunner {

	static final String SNAPSHOT = "seed/mensa-snapshot.json";

	private static final Logger log = LoggerFactory.getLogger(MensaSnapshotImporter.class);

	private final MensaEntityRepository mensas;
	private final EntityManager entityManager;
	private final JsonMapper jsonMapper;

	@org.springframework.beans.factory.annotation.Autowired(required = false)
	private MealEmbeddingService embeddingService;

	public MensaSnapshotImporter(MensaEntityRepository mensas, EntityManager entityManager, JsonMapper jsonMapper) {
		this.mensas = mensas;
		this.entityManager = entityManager;
		this.jsonMapper = jsonMapper;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		removeExcludedVenues();
		MensaDb db = readSnapshot();
		for (Campus c : db.campuses()) {
			if (entityManager.find(CampusEntity.class, c.id()) == null) {
				entityManager.persist(new CampusEntity(c.id(), c.name(), c.city()));
			}
		}
		int addedMensas = 0;
		for (Mensa m : db.mensas()) {
			if (!ExcludedMensas.allowed(m.id())) continue;
			if (mensas.findById(m.id()).isEmpty()) {
				entityManager.persist(toEntity(m));
				addedMensas++;
			}
		}
		if (addedMensas > 0) {
			log.info("Persisted {} new mensas into database from snapshot", addedMensas);
		}
		Long mealCount = entityManager.createQuery("select count(m) from MealEntity m", Long.class).getSingleResult();
		if (mealCount == 0) {
			List<MealEntity> rows = db.meals().stream()
					.filter(m -> ExcludedMensas.allowed(m.mensaId()))
					.map(MensaSnapshotImporter::toEntity)
					.toList();
			if (embeddingService != null) embeddingService.fill(rows);
			rows.forEach(entityManager::persist);
			log.info("Imported {} snapshot meals from {}", db.meals().size(), SNAPSHOT);
		}
		backfillFacilityIds();
		backfillCoordinates();
	}

	/** Removing managed entities also deletes their collection rows safely. */
	private void removeExcludedVenues() {
		var removedMeals = entityManager.createQuery("select m from MealEntity m where m.mensaId in :ids", MealEntity.class)
				.setParameter("ids", ExcludedMensas.IDS).getResultList();
		var subjects = new java.util.HashSet<>(ExcludedMensas.IDS);
		removedMeals.forEach(m -> subjects.add(m.getId()));
		entityManager.createQuery("select r from RatingEntity r where r.subjectId in :ids", com.visardlizards.backend.model.db.RatingEntity.class)
				.setParameter("ids", subjects).getResultList().forEach(entityManager::remove);
		entityManager.createQuery("select c from CrowdReportEntity c where c.mensaId in :ids", com.visardlizards.backend.model.db.CrowdReportEntity.class)
				.setParameter("ids", ExcludedMensas.IDS).getResultList().forEach(entityManager::remove);
		removedMeals.forEach(entityManager::remove);
		for (String id : ExcludedMensas.IDS) {
			var cached = entityManager.find(com.visardlizards.backend.model.db.ScrapedMenuEntity.class, id);
			if (cached != null) entityManager.remove(cached);
			mensas.findById(id).ifPresent(entityManager::remove);
		}
		entityManager.flush();
	}

	/** Databases created before the eth_facility_id column existed get the ids from the snapshot. */
	private void backfillFacilityIds() {
		List<MensaEntity> missing = mensas.findAll().stream()
				.filter(m -> m.getEthFacilityId() == null && "ETH".equals(m.getInstitution()))
				.toList();
		if (missing.isEmpty()) {
			return;
		}
		Map<String, Integer> facilityIds = new HashMap<>();
		for (Mensa m : readSnapshot().mensas()) {
			if (m.source() != null && m.source().facilityId() != null) {
				facilityIds.put(m.id(), m.source().facilityId());
			}
		}
		missing.forEach(m -> m.setEthFacilityId(facilityIds.get(m.getId())));
		log.info("Filled ETH facility ids of {} mensas from {}", missing.size(), SNAPSHOT);
	}

	/** Databases created before the coordinate columns existed get the coordinates from the snapshot. */
	private void backfillCoordinates() {
		List<MensaEntity> missing = mensas.findAll().stream().filter(m -> m.getLatitude() == null).toList();
		if (missing.isEmpty()) {
			return;
		}
		Map<String, Coordinates> coordinates = new HashMap<>();
		for (Mensa m : readSnapshot().mensas()) {
			if (m.coordinates() != null) {
				coordinates.put(m.id(), m.coordinates());
			}
		}
		int filled = 0;
		for (MensaEntity m : missing) {
			Coordinates c = coordinates.get(m.getId());
			if (c != null) {
				m.setCoordinates(c.lat(), c.lng(), c.source());
				filled++;
			}
		}
		log.info("Filled coordinates of {} mensas from {}", filled, SNAPSHOT);
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
				m.address().postalCode(), m.address().city(), m.address().building(),
				m.coordinates() == null ? null : m.coordinates().lat(),
				m.coordinates() == null ? null : m.coordinates().lng(),
				m.coordinates() == null ? null : m.coordinates().source(), m.hasMenu(),
				m.temporarilyClosed(), m.source() == null ? null : m.source().facilityId(), serviceHours, closures);
	}

	private static MealEntity toEntity(Meal m) {
		return new MealEntity(m.id(), m.mensaId(), m.date(), m.service(), m.line(), m.kind(), m.title(), m.dietTag(),
				m.price() == null ? null : m.price().student(),
				m.price() == null ? null : m.price().staff(),
				m.price() == null ? null : m.price().external(),
				m.ecoScore(), m.climateImpact(), m.components(), m.allergens());
	}

}
