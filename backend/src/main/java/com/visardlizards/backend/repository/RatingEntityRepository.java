package com.visardlizards.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.visardlizards.backend.model.db.RatingEntity;

interface RatingEntityRepository extends JpaRepository<RatingEntity, Long> {

	List<RatingEntity> findBySubjectId(String subjectId);

	@Query("""
			select r from RatingEntity r
			where r.subjectId = :mensaId
			   or (r.userId is not null and exists (
			       select m.id from MealEntity m
			       where m.id = r.subjectId and m.mensaId = :mensaId))
			""")
	List<RatingEntity> findByMensaId(@Param("mensaId") String mensaId);

	boolean existsBySubjectIdAndUserId(String subjectId, String userId);

	Optional<RatingEntity> findBySubjectIdAndUserId(String subjectId, String userId);

}
