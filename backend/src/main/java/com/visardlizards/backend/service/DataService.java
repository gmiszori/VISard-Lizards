package com.visardlizards.backend.service;

import com.visardlizards.backend.config.CacheConfig;
import com.visardlizards.backend.model.domain.DataRecord;
import com.visardlizards.backend.repository.DataRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class DataService {

    private final DataRepository dataRepository;

    public DataService(DataRepository dataRepository) {
        this.dataRepository = dataRepository;
    }

    @Cacheable(value = CacheConfig.DATA_CACHE, key = "#id")
    public Optional<DataRecord> getById(Long id) {
        return dataRepository.findById(id);
    }

    @Cacheable(value = CacheConfig.DATA_CACHE, key = "'key:' + #dataKey")
    public Optional<DataRecord> getByKey(String dataKey) {
        return dataRepository.findByKey(dataKey);
    }

    public List<DataRecord> getAll() {
        return dataRepository.findAll();
    }

    @Cacheable(value = CacheConfig.DATA_CACHE, key = "'search:' + #query")
    public List<DataRecord> search(String query) {
        return dataRepository.search(query);
    }

    @CacheEvict(value = CacheConfig.DATA_CACHE, allEntries = true)
    public DataRecord save(String dataKey, String content) {
        if (dataKey == null || dataKey.trim().isEmpty()) {
            throw new IllegalArgumentException("dataKey cannot be null or empty");
        }
        return dataRepository.save(dataKey.trim(), content);
    }

    @CacheEvict(value = CacheConfig.DATA_CACHE, allEntries = true)
    public List<DataRecord> saveBatch(List<DataRecord> records) {
        return records.stream()
                .map(r -> save(r.dataKey(), r.content()))
                .toList();
    }

    @CacheEvict(value = CacheConfig.DATA_CACHE, allEntries = true)
    public Optional<DataRecord> updateById(Long id, String content) {
        return dataRepository.updateById(id, content);
    }

    @CacheEvict(value = CacheConfig.DATA_CACHE, allEntries = true)
    public void deleteById(Long id) {
        dataRepository.deleteById(id);
    }

    @CacheEvict(value = CacheConfig.DATA_CACHE, allEntries = true)
    public boolean deleteByKey(String dataKey) {
        return dataRepository.deleteByKey(dataKey);
    }
}
