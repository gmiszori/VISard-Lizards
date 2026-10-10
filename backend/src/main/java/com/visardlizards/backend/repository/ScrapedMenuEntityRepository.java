package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.ScrapedMenuEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScrapedMenuEntityRepository extends JpaRepository<ScrapedMenuEntity,String> { }
