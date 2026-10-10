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

	/** WGS84, null when unknown. */
	private Double latitude;

	private Double longitude;

	/** Where latitude/longitude come from, e.g. "zfv.ch page". */
	private String coordinatesSource;

	private boolean hasMenu;

	private boolean temporarilyClosed;

	/** ETH Cookpit facility id for the live menu import, null for UZH mensas. */
	@Column(name = "eth_facility_id")
	private Integer ethFacilityId;

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
			String city, String building, Double latitude, Double longitude, String coordinatesSource, boolean hasMenu,
			boolean temporarilyClosed, Integer ethFacilityId,
			List<ServiceHoursEmbeddable> serviceHours, List<ClosureEmbeddable> closures) {
		this.id = id;
		this.name = name;
		this.institution = institution;
		this.campusId = campusId;
		this.street = street;
		this.postalCode = postalCode;
		this.city = city;
		this.building = building;
		this.latitude = latitude;
		this.longitude = longitude;
		this.coordinatesSource = coordinatesSource;
		this.hasMenu = hasMenu;
		this.temporarilyClosed = temporarilyClosed;
		this.ethFacilityId = ethFacilityId;
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

	public Double getLatitude() {
		return latitude;
	}

	public Double getLongitude() {
		return longitude;
	}

	public String getCoordinatesSource() {
		return coordinatesSource;
	}

	/** Fills the coordinates for databases created before the columns existed. */
	public void setCoordinates(Double latitude, Double longitude, String coordinatesSource) {
		this.latitude = latitude;
		this.longitude = longitude;
		this.coordinatesSource = coordinatesSource;
	}

	public boolean isHasMenu() {
		return hasMenu;
	}

	public boolean isTemporarilyClosed() {
		return temporarilyClosed;
	}

	public Integer getEthFacilityId() {
		return ethFacilityId;
	}

	/** Fills the facility id for databases created before the column existed. */
	public void setEthFacilityId(Integer ethFacilityId) {
		this.ethFacilityId = ethFacilityId;
	}

	public List<ServiceHoursEmbeddable> getServiceHours() {
		return serviceHours;
	}

	public List<ClosureEmbeddable> getClosures() {
		return closures;
	}

}
