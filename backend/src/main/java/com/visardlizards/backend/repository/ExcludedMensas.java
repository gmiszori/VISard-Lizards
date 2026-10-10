package com.visardlizards.backend.repository;

import java.util.Set;

/** Removed venues must not be reintroduced by seed, live imports or scraper caches. */
public final class ExcludedMensas {
    public static final Set<String> IDS = Set.of("bistro-hpi", "bellavista");
    private ExcludedMensas() {}
    public static boolean allowed(String id) { return !IDS.contains(id); }
}
