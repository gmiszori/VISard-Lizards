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
	void roundTripKeepsMealDetails() {
		var meal = mensaRepository.findMealById("alumni-quattro-lounge.2026-09-28.dinner.0").orElseThrow();
		assertThat(meal.components()).containsExactly("Ground beef", "Elbow macaroni", "Applesauce", "Extra-hard cheese");
		assertThat(meal.allergens()).containsExactly("gluten", "milk", "celery");
		assertThat(meal.price()).isNotNull();
		assertThat(meal.price().external()).isEqualByComparingTo("14.5");
	}

}
