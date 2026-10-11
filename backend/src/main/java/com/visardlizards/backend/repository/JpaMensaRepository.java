package com.visardlizards.backend.repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SortedSet;
import java.util.TreeSet;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.CampusEntity;
import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.db.MensaEntity;
import com.visardlizards.backend.model.db.ServiceHoursEmbeddable;
import com.visardlizards.backend.model.domain.Address;
import com.visardlizards.backend.model.domain.Campus;
import com.visardlizards.backend.model.domain.Closure;
import com.visardlizards.backend.model.domain.Coordinates;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.MensaSource;
import com.visardlizards.backend.model.domain.Price;
import com.visardlizards.backend.model.domain.ServiceHours;
import com.visardlizards.backend.service.MealEmbeddingService;

/** Mensas, campuses and meals from the database, mapped to domain models. Filled by MensaSnapshotImporter. */
@Repository
@Transactional(readOnly = true)
public class JpaMensaRepository implements MensaRepository {

	private static final List<String> WEEKDAYS = List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");

	private final MensaEntityRepository mensas;
	private final CampusEntityRepository campuses;
	private final MealEntityRepository meals;

	@org.springframework.beans.factory.annotation.Autowired(required = false)
	private MealEmbeddingService embeddingService;

	public JpaMensaRepository(MensaEntityRepository mensas, CampusEntityRepository campuses, MealEntityRepository meals) {
		this.mensas = mensas;
		this.campuses = campuses;
		this.meals = meals;
	}

	@Override
	public List<Mensa> findAllMensas() {
		return mensas.findAll(Sort.by("name")).stream().filter(m -> ExcludedMensas.allowed(m.getId())).map(JpaMensaRepository::toDomain).toList();
	}

	@Override
	public Optional<Mensa> findMensaById(String id) {
		if (!ExcludedMensas.allowed(id)) return Optional.empty();
		return mensas.findById(id).map(JpaMensaRepository::toDomain);
	}

	@Override
	public List<Campus> findAllCampuses() {
		return campuses.findAll(Sort.by("id")).stream().map(JpaMensaRepository::toDomain).toList();
	}

	@Override
	public Optional<Campus> findCampusById(String id) {
		return campuses.findById(id).map(JpaMensaRepository::toDomain);
	}

	@Override
	public Optional<Meal> findMealById(String id) {
		return meals.findById(id).filter(m -> ExcludedMensas.allowed(m.getMensaId())).map(JpaMensaRepository::toDomain);
	}

	@Override
	public List<Meal> findMealsOn(LocalDate date) {
		return preferUpstream(meals.findByDateOrderByMensaIdAscIdAsc(date)).stream().map(JpaMensaRepository::toDomain).toList();
	}

	@Override
	public SortedSet<LocalDate> findMealDates() {
		return new TreeSet<>(meals.findDistinctDates());
	}

	@Override
	public List<Meal> findMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd) {
		if (!ExcludedMensas.allowed(mensaId)) return List.of();
		return preferUpstream(meals.findByMensaIdAndDateBetweenOrderByDateAsc(mensaId, dateStart, dateEnd)).stream()
				.map(JpaMensaRepository::toDomain)
				.toList();
	}

	@Override
	@Transactional
	public void replaceMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd, List<Meal> newMeals) {
		if (!ExcludedMensas.allowed(mensaId)) return;
		meals.deleteAll(meals.findByMensaIdAndDateBetweenOrderByDateAsc(mensaId, dateStart, dateEnd));
		meals.flush();
		List<MealEntity> rows = newMeals.stream()
				.filter(m -> ExcludedMensas.allowed(m.mensaId()))
				.map(JpaMensaRepository::toEntity)
				.toList();
		if (embeddingService != null) embeddingService.fill(rows);
		meals.saveAll(rows);
	}

	private static MealEntity toEntity(Meal m) {
		return new MealEntity(m.id(), m.mensaId(), m.date(), m.service(), m.line(), m.kind(), m.title(), m.dietTag(),
				m.price() == null ? null : m.price().student(),
				m.price() == null ? null : m.price().staff(),
				m.price() == null ? null : m.price().external(),
				m.ecoScore(), m.climateImpact(), m.components(), m.allergens());
	}
	/** An upstream import may arrive after a scraper fallback: display only one source per venue/day. */
	private static List<MealEntity> preferUpstream(List<MealEntity> rows) {
		var nativeDays=new java.util.HashSet<String>();
		for(var row:rows) if(!row.getId().startsWith("mcp.") && !row.getTitle().isBlank() && !row.getTitle().equalsIgnoreCase("novalue"))
			nativeDays.add(row.getMensaId()+"|"+row.getDate());
		return rows.stream().filter(row -> ExcludedMensas.allowed(row.getMensaId()))
				.filter(row -> !row.getId().startsWith("mcp.") || !nativeDays.contains(row.getMensaId()+"|"+row.getDate())).toList();
	}

	private static Campus toDomain(CampusEntity e) {
		return new Campus(e.getId(), e.getName(), e.getCity());
	}

	private static Mensa toDomain(MensaEntity e) {
		Map<String, List<ServiceHours>> openingHours = new LinkedHashMap<>();
		WEEKDAYS.forEach(day -> openingHours.put(day, new ArrayList<>()));
		e.getServiceHours().stream()
				.sorted(Comparator.comparing(ServiceHoursEmbeddable::getOpenTime))
				.forEach(h -> openingHours.get(h.getWeekday())
						.add(new ServiceHours(h.getService(), h.getOpenTime(), h.getCloseTime())));
		List<Closure> closures = e.getClosures().stream()
				.map(c -> new Closure(c.getFromDate(), c.getToDate(), c.getNote()))
				.toList();
		return new Mensa(e.getId(), e.getName(), e.getInstitution(), e.getCampusId(),
				new Address(e.getStreet(), e.getPostalCode(), e.getCity(), e.getBuilding()),
				e.getLatitude() == null || e.getLongitude() == null ? null
						: new Coordinates(e.getLatitude(), e.getLongitude(), e.getCoordinatesSource()),
				e.isHasMenu(), e.isTemporarilyClosed(), openingHours, closures, new MensaSource(e.getEthFacilityId()));
	}

	private static Meal toDomain(MealEntity e) {
		Price price = e.getPriceStudent() == null && e.getPriceStaff() == null && e.getPriceExternal() == null
				? null
				: new Price(e.getPriceStudent(), e.getPriceStaff(), e.getPriceExternal());
		return new Meal(e.getId(), e.getMensaId(), e.getDate(), e.getService(), e.getLine(), e.getKind(), e.getTitle(),
				List.copyOf(e.getComponents()), e.getDietTag(), price, List.copyOf(e.getAllergens()), e.getEcoScore(),
				e.getClimateImpact());
	}

}
