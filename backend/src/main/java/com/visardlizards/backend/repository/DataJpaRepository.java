package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.DataEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DataJpaRepository extends JpaRepository<DataEntity, Long> {
    Optional<DataEntity> findByDataKey(String dataKey);
    boolean existsByDataKey(String dataKey);

    @Query("SELECT d FROM DataEntity d WHERE LOWER(d.dataKey) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(d.content) LIKE LOWER(CONCAT('%', :query, '%'))")
    List<DataEntity> searchByQuery(@Param("query") String query);
}
