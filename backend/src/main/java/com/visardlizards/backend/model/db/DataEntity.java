package com.visardlizards.backend.model.db;

import jakarta.persistence.*;

@Entity
@Table(name = "data_records")
public class DataEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String dataKey;

    @Column(columnDefinition = "TEXT")
    private String content;

    public DataEntity() {
    }

    public DataEntity(Long id, String dataKey, String content) {
        this.id = id;
        this.dataKey = dataKey;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getDataKey() {
        return dataKey;
    }

    public void setDataKey(String dataKey) {
        this.dataKey = dataKey;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
