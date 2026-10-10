package com.visardlizards.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class MensaSnapshotImporterTests {

	@Autowired
	private MensaSnapshotImporter importer;

	@Autowired
	private MensaEntityRepository mensas;

	@Autowired
	private MealEntityRepository meals;

	@Autowired
	private CampusEntityRepository campuses;

	@Autowired
	private MensaRepository mensaRepository;

	@Test
	void importsTheWholeSnapshotOnStartup() {
		assertThat(campuses.count()).isEqualTo(3);
		assertThat(mensas.count()).isEqualTo(22);
		assertThat(meals.count()).isEqualTo(901);
	}

	@Test
	void secondRunKeepsExistingData() {
		importer.run(new DefaultApplicationArguments());
		assertThat(mensas.count()).isEqualTo(22);
		assertThat(meals.count()).isEqualTo(901);
	}

	@Test
	void roundTripKeepsMensaDetails() {
		var archimedes = mensaRepository.findMensaById("archimedes").orElseThrow();
		assertThat(archimedes.address().street()).isEqualTo("Gloriastrasse 37/39");
		assertThat(archimedes.serviceHoursOn(LocalDate.of(2026, 10, 5))).hasSize(1);
		assertThat(mensaRepository.findMensaById("uzh-raemi-59").orElseThrow().closures()).isNotEmpty();
	}

	@Test
	void everyMensaHasCoordinates() {
		assertThat(mensaRepository.findAllMensas()).allSatisfy(m -> assertThat(m.coordinates()).isNotNull());
		var polyterrasse = mensaRepository.findMensaById("polyterrasse").orElseThrow().coordinates();
		assertThat(polyterrasse.lat()).isEqualTo(47.3762048);
		assertThat(polyterrasse.lng()).isEqualTo(8.5467367);
	}

	@Test
	void fillsCoordinatesOfOlderDatabases() {
		var polyterrasse = mensas.findById("polyterrasse").orElseThrow();
		polyterrasse.setCoordinates(null, null, null);
		mensas.saveAndFlush(polyterrasse);

		importer.run(new DefaultApplicationArguments());

		var coordinates = mensaRepository.findMensaById("polyterrasse").orElseThrow().coordinates();
		assertThat(coordinates).isNotNull();
		assertThat(coordinates.lat()).isEqualTo(47.3762048);
	}

	@Test
	void roundTripKeepsMealDetails() {
		var meal = mensaRepository.findMealById("alumni-quattro-lounge.2026-09-28.dinner.0").orElseThrow();
		assertThat(meal.components()).containsExactly("Ground beef", "Elbow macaroni", "Applesauce", "Extra-hard cheese");
		assertThat(meal.allergens()).containsExactly("gluten", "milk", "celery");
		assertThat(meal.price()).isNotNull();
		assertThat(meal.price().external()).isEqualByComparingTo("14.5");
	}

}
