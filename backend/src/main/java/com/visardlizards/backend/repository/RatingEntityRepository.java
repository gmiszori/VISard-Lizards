package com.visardlizards.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.visardlizards.backend.model.db.RatingEntity;

interface RatingEntityRepository extends JpaRepository<RatingEntity, Long> {

	List<RatingEntity> findBySubjectId(String subjectId);

	boolean existsBySubjectIdAndUserId(String subjectId, String userId);

	Optional<RatingEntity> findBySubjectIdAndUserId(String subjectId, String userId);

}
