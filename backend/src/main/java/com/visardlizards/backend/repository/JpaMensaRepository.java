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
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.model.domain.Price;
import com.visardlizards.backend.model.domain.ServiceHours;

/** Mensas, campuses and meals from the database, mapped to domain models. Filled by MensaSnapshotImporter. */
@Repository
@Transactional(readOnly = true)
public class JpaMensaRepository implements MensaRepository {

	private static final List<String> WEEKDAYS = List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");

	private final MensaEntityRepository mensas;
	private final CampusEntityRepository campuses;
	private final MealEntityRepository meals;

	public JpaMensaRepository(MensaEntityRepository mensas, CampusEntityRepository campuses, MealEntityRepository meals) {
		this.mensas = mensas;
		this.campuses = campuses;
		this.meals = meals;
	}

	@Override
	public List<Mensa> findAllMensas() {
		return mensas.findAll(Sort.by("name")).stream().map(JpaMensaRepository::toDomain).toList();
	}

	@Override
	public Optional<Mensa> findMensaById(String id) {
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
		return meals.findById(id).map(JpaMensaRepository::toDomain);
	}

	@Override
	public SortedSet<LocalDate> findMealDates() {
		return new TreeSet<>(meals.findDistinctDates());
	}

	@Override
	public List<Meal> findMeals(String mensaId, LocalDate dateStart, LocalDate dateEnd) {
		return meals.findByMensaIdAndDateBetweenOrderByDateAsc(mensaId, dateStart, dateEnd).stream()
				.map(JpaMensaRepository::toDomain)
				.toList();
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
				e.isHasMenu(), e.isTemporarilyClosed(), openingHours, closures);
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
