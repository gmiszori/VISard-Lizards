package com.visardlizards.backend.controller;

import com.visardlizards.backend.model.domain.DataRecord;
import com.visardlizards.backend.model.dto.DataRequestDto;
import com.visardlizards.backend.model.dto.DataResponseDto;
import com.visardlizards.backend.service.DataService;
import org.springframework.http.ResponseEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/data")
@ConditionalOnProperty(name = "app.internal-api.enabled", havingValue = "true")
public class DataController {

    private final DataService dataService;

    public DataController(DataService dataService) {
        this.dataService = dataService;
    }

    @GetMapping
    public List<DataResponseDto> getAll() {
        return dataService.getAll().stream()
                .map(this::toResponseDto)
                .toList();
    }

    @GetMapping("/search")
    public List<DataResponseDto> search(@RequestParam(name = "q", defaultValue = "") String query) {
        return dataService.search(query).stream()
                .map(this::toResponseDto)
                .toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<DataResponseDto> getById(@PathVariable Long id) {
        return dataService.getById(id)
                .map(this::toResponseDto)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/key/{key}")
    public ResponseEntity<DataResponseDto> getByKey(@PathVariable String key) {
        return dataService.getByKey(key)
                .map(this::toResponseDto)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<DataResponseDto> createOrUpdate(@RequestBody DataRequestDto request) {
        DataRecord saved = dataService.save(request.dataKey(), request.content());
        return ResponseEntity.ok(toResponseDto(saved));
    }

    @PostMapping("/batch")
    public ResponseEntity<List<DataResponseDto>> createBatch(@RequestBody List<DataRequestDto> requests) {
        List<DataRecord> domainItems = requests.stream()
                .map(r -> new DataRecord(null, r.dataKey(), r.content()))
                .toList();
        List<DataRecord> saved = dataService.saveBatch(domainItems);
        return ResponseEntity.ok(saved.stream().map(this::toResponseDto).toList());
    }

    @PutMapping("/{id}")
    public ResponseEntity<DataResponseDto> updateById(@PathVariable Long id, @RequestBody DataRequestDto request) {
        return dataService.updateById(id, request.content())
                .map(this::toResponseDto)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        dataService.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/key/{key}")
    public ResponseEntity<Void> deleteByKey(@PathVariable String key) {
        boolean deleted = dataService.deleteByKey(key);
        return deleted ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    private DataResponseDto toResponseDto(DataRecord domain) {
        return new DataResponseDto(domain.id(), domain.dataKey(), domain.content());
    }
}
