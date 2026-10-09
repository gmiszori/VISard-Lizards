package com.visardlizards.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.visardlizards.backend.model.db.CampusEntity;

interface CampusEntityRepository extends JpaRepository<CampusEntity, String> {
}
