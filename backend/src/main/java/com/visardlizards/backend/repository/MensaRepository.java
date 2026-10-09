package com.visardlizards.backend.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.visardlizards.backend.model.domain.Campus;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;

/**
 * Read access to mensas and their meals. The current implementation reads a static
 * JSON snapshot; a live implementation (ETH/UZH APIs) can replace it later.
 */
public interface MensaRepository {

	List<Mensa> findAllMensas();

	Optional<Mensa> findMensaById(String id);

	Optional<Campus> findCampusById(String id);

	/** Meals of a mensa between both dates (inclusive), ordered by date. */
	List<Meal> findMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd);

}
