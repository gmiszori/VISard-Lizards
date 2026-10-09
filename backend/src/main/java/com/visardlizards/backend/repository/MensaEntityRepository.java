package com.visardlizards.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.visardlizards.backend.model.db.MensaEntity;

interface MensaEntityRepository extends JpaRepository<MensaEntity, String> {
}
