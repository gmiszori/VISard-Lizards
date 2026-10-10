package com.visardlizards.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.visardlizards.backend.model.db.PushSubscriptionEntity;

public interface PushSubscriptionEntityRepository extends JpaRepository<PushSubscriptionEntity, Long> {

	Optional<PushSubscriptionEntity> findByEndpoint(String endpoint);

}
