package com.visardlizards.backend.model.db;

import jakarta.persistence.*;

/** Raw MCP evidence and refresh metadata, retained alongside the public meal rows. */
@Entity
@Table(name="scraped_menu")
public class ScrapedMenuEntity {
    @Id private String id;
    @Lob @Column(nullable=false) private String payload;
    protected ScrapedMenuEntity() { }
    public ScrapedMenuEntity(String id, String payload) { this.id=id; this.payload=payload; }
    public String getId() { return id; }
    public String getPayload() { return payload; }
}
