package com.visardlizards.backend.repository;

import com.visardlizards.backend.model.db.DataEntity;
import com.visardlizards.backend.model.domain.DataRecord;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class DataRepository {

    private final DataJpaRepository jpaRepository;

    public DataRepository(DataJpaRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    public Optional<DataRecord> findById(Long id) {
        return jpaRepository.findById(id).map(this::toDomain);
    }

    public Optional<DataRecord> findByKey(String dataKey) {
        return jpaRepository.findByDataKey(dataKey).map(this::toDomain);
    }

    public List<DataRecord> findAll() {
        return jpaRepository.findAll().stream()
                .map(this::toDomain)
                .toList();
    }

    public List<DataRecord> search(String query) {
        if (query == null || query.trim().isEmpty()) {
            return findAll();
        }
        return jpaRepository.searchByQuery(query.trim()).stream()
                .map(this::toDomain)
                .toList();
    }

    public DataRecord save(String dataKey, String content) {
        DataEntity entity = jpaRepository.findByDataKey(dataKey)
                .orElse(new DataEntity(null, dataKey, content));
        entity.setContent(content);
        DataEntity saved = jpaRepository.save(entity);
        return toDomain(saved);
    }

    public Optional<DataRecord> updateById(Long id, String content) {
        return jpaRepository.findById(id).map(entity -> {
            entity.setContent(content);
            return toDomain(jpaRepository.save(entity));
        });
    }

    public void deleteById(Long id) {
        jpaRepository.deleteById(id);
    }

    public boolean deleteByKey(String dataKey) {
        Optional<DataEntity> existing = jpaRepository.findByDataKey(dataKey);
        if (existing.isPresent()) {
            jpaRepository.delete(existing.get());
            return true;
        }
        return false;
    }

    private DataRecord toDomain(DataEntity entity) {
        return new DataRecord(entity.getId(), entity.getDataKey(), entity.getContent());
    }
}
