package com.visardlizards.backend.model.db;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

@Entity
@Table(name = "mensa")
public class MensaEntity {

	@Id
	private String id;

	@Column(nullable = false)
	private String name;

	/** ETH or UZH */
	@Column(nullable = false)
	private String institution;

	@Column(name = "campus_id", nullable = false)
	private String campusId;

	@Column(nullable = false)
	private String street;

	private String postalCode;

	@Column(nullable = false)
	private String city;

	private String building;

	private boolean hasMenu;

	private boolean temporarilyClosed;

	@ElementCollection
	@CollectionTable(name = "mensa_service_hours", joinColumns = @JoinColumn(name = "mensa_id"))
	@OrderColumn(name = "position")
	private List<ServiceHoursEmbeddable> serviceHours = new ArrayList<>();

	@ElementCollection
	@CollectionTable(name = "mensa_closure", joinColumns = @JoinColumn(name = "mensa_id"))
	@OrderColumn(name = "position")
	private List<ClosureEmbeddable> closures = new ArrayList<>();

	protected MensaEntity() {
	}

	public MensaEntity(String id, String name, String institution, String campusId, String street, String postalCode,
			String city, String building, boolean hasMenu, boolean temporarilyClosed,
			List<ServiceHoursEmbeddable> serviceHours, List<ClosureEmbeddable> closures) {
		this.id = id;
		this.name = name;
		this.institution = institution;
		this.campusId = campusId;
		this.street = street;
		this.postalCode = postalCode;
		this.city = city;
		this.building = building;
		this.hasMenu = hasMenu;
		this.temporarilyClosed = temporarilyClosed;
		this.serviceHours = new ArrayList<>(serviceHours);
		this.closures = new ArrayList<>(closures);
	}

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getInstitution() {
		return institution;
	}

	public String getCampusId() {
		return campusId;
	}

	public String getStreet() {
		return street;
	}

	public String getPostalCode() {
		return postalCode;
	}

	public String getCity() {
		return city;
	}

	public String getBuilding() {
		return building;
	}

	public boolean isHasMenu() {
		return hasMenu;
	}

	public boolean isTemporarilyClosed() {
		return temporarilyClosed;
	}

	public List<ServiceHoursEmbeddable> getServiceHours() {
		return serviceHours;
	}

	public List<ClosureEmbeddable> getClosures() {
		return closures;
	}

}
