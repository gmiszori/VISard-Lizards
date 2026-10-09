package com.visardlizards.backend.repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import com.visardlizards.backend.model.domain.Campus;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.MensaDb;

import tools.jackson.databind.json.JsonMapper;

/**
 * Loads resources/data/mensa-db.json once at startup.
 * Regenerate the file with: node backend/scripts/export-mensa-db.mjs
 */
@Repository
public class JsonMensaRepository implements MensaRepository {

	private static final String DATA_FILE = "data/mensa-db.json";

	private final List<Mensa> mensas;
	private final Map<String, Mensa> mensasById;
	private final Map<String, Campus> campusesById;
	private final Map<String, List<Meal>> mealsByMensaId;

	public JsonMensaRepository(JsonMapper jsonMapper) {
		MensaDb db;
		try (InputStream in = new ClassPathResource(DATA_FILE).getInputStream()) {
			db = jsonMapper.readValue(in, MensaDb.class);
		} catch (IOException e) {
			throw new UncheckedIOException("Could not read " + DATA_FILE, e);
		}
		this.mensas = List.copyOf(db.mensas());
		this.mensasById = mensas.stream().collect(Collectors.toMap(Mensa::id, Function.identity()));
		this.campusesById = db.campuses().stream().collect(Collectors.toMap(Campus::id, Function.identity()));
		this.mealsByMensaId = db.meals().stream()
				.sorted(Comparator.comparing(Meal::date))
				.collect(Collectors.groupingBy(Meal::mensaId));
	}

	@Override
	public List<Mensa> findAllMensas() {
		return mensas;
	}

	@Override
	public Optional<Mensa> findMensaById(String id) {
		return Optional.ofNullable(mensasById.get(id));
	}

	@Override
	public Optional<Campus> findCampusById(String id) {
		return Optional.ofNullable(campusesById.get(id));
	}

	@Override
	public List<Meal> findMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd) {
		return mealsByMensaId.getOrDefault(mensaId, List.of()).stream()
				.filter(meal -> !meal.date().isBefore(dateStart) && !meal.date().isAfter(dateEnd))
				.toList();
	}

}
