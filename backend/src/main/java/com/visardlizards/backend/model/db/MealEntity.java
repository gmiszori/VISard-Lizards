package com.visardlizards.backend.model.db;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.BatchSize;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

@Entity
@Table(name = "meal", indexes = {
		@Index(name = "idx_meal_mensa_date", columnList = "mensa_id, meal_date"),
		@Index(name = "idx_meal_date", columnList = "meal_date") })
public class MealEntity {

	/** e.g. "polyterrasse.2026-10-06.lunch.2" */
	@Id
	private String id;

	@Column(name = "mensa_id", nullable = false)
	private String mensaId;

	@Column(name = "meal_date", nullable = false)
	private LocalDate date;

	/** lunch or dinner */
	@Column(nullable = false)
	private String service;

	/** Counter / line name as published */
	private String line;

	/** main, buffet, dessert, drink */
	@Column(nullable = false)
	private String kind;

	@Column(nullable = false, length = 500)
	private String title;

	/** vegan, vegetarian, meat, fish */
	@Column(nullable = false)
	private String dietTag;

	@Column(precision = 6, scale = 2)
	private BigDecimal priceStudent;

	@Column(precision = 6, scale = 2)
	private BigDecimal priceStaff;

	@Column(precision = 6, scale = 2)
	private BigDecimal priceExternal;

	private String ecoScore;

	private String climateImpact;

	/** JSON encoded embedding of title, line and components; the only search schema addition. */
	@jakarta.persistence.Lob
	@Column(name = "semantic_embedding")
	private String semanticEmbedding;

	@ElementCollection
	@CollectionTable(name = "meal_component", joinColumns = @JoinColumn(name = "meal_id"))
	@OrderColumn(name = "position")
	@Column(name = "component", length = 500)
	@BatchSize(size = 100)
	private List<String> components = new ArrayList<>();

	@ElementCollection
	@CollectionTable(name = "meal_allergen", joinColumns = @JoinColumn(name = "meal_id"))
	@OrderColumn(name = "position")
	@Column(name = "allergen")
	@BatchSize(size = 100)
	private List<String> allergens = new ArrayList<>();

	@ElementCollection
	@CollectionTable(name = "meal_trace_allergen", joinColumns = @JoinColumn(name = "meal_id"))
	@OrderColumn(name = "position")
	@Column(name = "allergen")
	@BatchSize(size = 100)
	private List<String> traceAllergens = new ArrayList<>();

	protected MealEntity() {
	}

	public MealEntity(String id, String mensaId, LocalDate date, String service, String line, String kind, String title,
			String dietTag, BigDecimal priceStudent, BigDecimal priceStaff, BigDecimal priceExternal, String ecoScore,
			String climateImpact, List<String> components, List<String> allergens) {
		this.id = id;
		this.mensaId = mensaId;
		this.date = date;
		this.service = service;
		this.line = line;
		this.kind = kind;
		this.title = title;
		this.dietTag = dietTag;
		this.priceStudent = priceStudent;
		this.priceStaff = priceStaff;
		this.priceExternal = priceExternal;
		this.ecoScore = ecoScore;
		this.climateImpact = climateImpact;
		this.components = new ArrayList<>(components);
		this.allergens = new ArrayList<>(allergens);
	}

	public String getId() {
		return id;
	}

	public String getMensaId() {
		return mensaId;
	}

	public LocalDate getDate() {
		return date;
	}

	public String getService() {
		return service;
	}

	public String getLine() {
		return line;
	}

	public String getKind() {
		return kind;
	}

	public String getTitle() {
		return title;
	}

	public String getDietTag() {
		return dietTag;
	}

	public BigDecimal getPriceStudent() {
		return priceStudent;
	}

	public BigDecimal getPriceStaff() {
		return priceStaff;
	}

	public BigDecimal getPriceExternal() {
		return priceExternal;
	}

	public String getEcoScore() {
		return ecoScore;
	}

	public String getClimateImpact() {
		return climateImpact;
	}

	public List<String> getComponents() {
		return components;
	}

	public List<String> getAllergens() {
		return allergens;
	}
	public List<String> getTraceAllergens() { return traceAllergens; }
	public void setTraceAllergens(List<String> values) { traceAllergens = new ArrayList<>(values); }

	public String getSemanticEmbedding() {
		return semanticEmbedding;
	}

	public void setSemanticEmbedding(String semanticEmbedding) {
		this.semanticEmbedding = semanticEmbedding;
	}

}
