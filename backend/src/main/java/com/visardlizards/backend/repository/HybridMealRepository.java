package com.visardlizards.backend.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.List;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.visardlizards.backend.model.db.MealEntity;
import com.visardlizards.backend.model.dto.SearchCriteria;

import jakarta.persistence.EntityManager;

/** H2 compatible hard filtering. Ranking happens after this query so cosine can see every eligible row. */
@Repository
@Transactional(readOnly = true)
public class HybridMealRepository {
    private final EntityManager entityManager;

    public HybridMealRepository(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public List<MealEntity> candidates(LocalDate date, String contextMensaId, String contextCampusId,
            SearchCriteria.HardFilters filters) {
        return candidates(date, contextMensaId, contextCampusId, null, filters);
    }

    public List<MealEntity> candidates(LocalDate date, String contextMensaId, String contextCampusId,
            List<String> contextCampusIds, SearchCriteria.HardFilters filters) {
        StringBuilder jpql = new StringBuilder("select m from MealEntity m, MensaEntity v where v.id = m.mensaId and m.date = :date");
        Map<String, Object> params = new HashMap<>();
        params.put("date", date);
        equality(jpql, params, "m.id", "id", filters.id());
        equality(jpql, params, "m.mensaId", "contextMensaId", contextMensaId);
        if (contextCampusIds == null) {
            equality(jpql, params, "v.campusId", "contextCampusId", contextCampusId);
        } else if (contextCampusIds.isEmpty()) {
            jpql.append(" and 1 = 0");
        } else {
            jpql.append(" and v.campusId in :contextCampusIds");
            params.put("contextCampusIds", contextCampusIds);
        }
        equality(jpql, params, "m.mensaId", "mensaId", filters.mensaId());
        equality(jpql, params, "v.campusId", "campusId", filters.campusId());
        equality(jpql, params, "m.dietTag", "dietTag", filters.dietTag());
        equality(jpql, params, "m.kind", "kind", filters.kind());
        equality(jpql, params, "m.service", "service", filters.service());
        bounds(jpql, params, "m.priceStudent", "priceStudent", filters.priceStudent());
        bounds(jpql, params, "m.priceStaff", "priceStaff", filters.priceStaff());
        bounds(jpql, params, "m.priceExternal", "priceExternal", filters.priceExternal());
        if (!filters.excludeAllergens().isEmpty()) {
            jpql.append(" and not exists (select 1 from MealEntity mx join mx.allergens a where mx.id = m.id and a in :excludedAllergens)");
            params.put("excludedAllergens", filters.excludeAllergens());
        }
        jpql.append(" order by m.mensaId, m.id");
        var query = entityManager.createQuery(jpql.toString(), MealEntity.class);
        params.forEach(query::setParameter);
        return query.getResultList();
    }

    public List<String> values(String field) {
        if (!List.of("dietTag", "kind", "service").contains(field))
            throw new IllegalArgumentException("Unsupported categorical field");
        return entityManager.createQuery("select distinct m." + field + " from MealEntity m where m." + field + " is not null order by m." + field, String.class)
                .getResultList();
    }

    public List<String> mensaIds() {
        return entityManager.createQuery("select v.id from MensaEntity v order by v.id", String.class).getResultList();
    }

    public List<String> campusIds() {
        return entityManager.createQuery("select distinct v.campusId from MensaEntity v order by v.campusId", String.class).getResultList();
    }

    public Map<String, String> mensaNames() {
        Map<String, String> result = new LinkedHashMap<>();
        for (Object[] row : entityManager.createQuery("select v.id, v.name from MensaEntity v order by v.id", Object[].class).getResultList())
            result.put((String) row[0], (String) row[1]);
        return result;
    }

    public List<String> allergenValues() {
        return entityManager.createQuery("select distinct a from MealEntity m join m.allergens a order by a", String.class)
                .getResultList();
    }

    private static void equality(StringBuilder jpql, Map<String, Object> params, String field, String name, String value) {
        if (value != null && !value.isBlank()) {
            jpql.append(" and ").append(field).append(" = :").append(name);
            params.put(name, value);
        }
    }

    private static void bounds(StringBuilder jpql, Map<String, Object> params, String field, String name,
            SearchCriteria.NumberBounds bounds) {
        if (bounds == null) return;
        boundary(jpql, params, field, name + "Gte", ">=", bounds.gte());
        boundary(jpql, params, field, name + "Lte", "<=", bounds.lte());
        boundary(jpql, params, field, name + "Gt", ">", bounds.gt());
        boundary(jpql, params, field, name + "Lt", "<", bounds.lt());
    }

    private static void boundary(StringBuilder jpql, Map<String, Object> params, String field, String name,
            String operator, BigDecimal value) {
        if (value != null) {
            jpql.append(" and ").append(field).append(' ').append(operator).append(" :").append(name);
            params.put(name, value);
        }
    }
}
