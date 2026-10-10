package com.visardlizards.backend.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;

import com.visardlizards.backend.model.db.MealEntity;

interface MealEntityRepository extends JpaRepository<MealEntity, String> {

	List<MealEntity> findByMensaIdAndDateBetweenOrderByDateAsc(String mensaId, LocalDate dateStart, LocalDate dateEnd);

	List<MealEntity> findByDateOrderByMensaIdAscIdAsc(LocalDate date);

	@Query("select distinct m.date from MealEntity m order by m.date")
	List<LocalDate> findDistinctDates();

	List<MealEntity> findBySemanticEmbeddingIsNull(Pageable pageable);

}
