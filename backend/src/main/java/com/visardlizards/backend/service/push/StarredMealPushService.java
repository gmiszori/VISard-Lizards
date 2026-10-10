package com.visardlizards.backend.service.push;

import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.visardlizards.backend.exception.NotFoundException;
import com.visardlizards.backend.model.db.PushSubscriptionEntity;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.repository.PushSubscriptionEntityRepository;
import com.visardlizards.backend.service.MensaService;
import com.visardlizards.backend.service.push.WebPushSender.PushTarget;
import com.visardlizards.backend.service.push.WebPushSender.Result;

/**
 * Push notifications for starred dishes: once a day (app.push.cron, 09:30 Zurich) every subscription whose
 * starred dish appears on a menu it has not been told about gets one notification listing those dishes.
 * Occurrences already on the menu when a dish is starred count as known, so only new menus trigger a push.
 */
@Service
public class StarredMealPushService {

	private static final Logger log = LoggerFactory.getLogger(StarredMealPushService.class);
	private static final ZoneId ZURICH = ZoneId.of("Europe/Zurich");
	/** How far ahead menus are looked at (published menus reach about a week ahead). */
	private static final int DAYS_AHEAD = 13;
	/** Dish lines in one notification before "+n more". */
	private static final int MAX_LINES = 3;

	private final PushSubscriptionEntityRepository subscriptions;
	private final MensaService mensaService;
	private final WebPushSender sender;
	private final Clock clock;
	private final boolean enabled;

	public StarredMealPushService(PushSubscriptionEntityRepository subscriptions, MensaService mensaService,
			WebPushSender sender, Clock clock, @Value("${app.push.enabled:true}") boolean enabled) {
		this.subscriptions = subscriptions;
		this.mensaService = mensaService;
		this.sender = sender;
		this.clock = clock;
		this.enabled = enabled;
	}

	/** A starred dish served at a mensa on a date. */
	record Occurrence(LocalDate date, String dish, String mensaId, String mensaName) {
	}

	/** Case, spacing and Unicode form do not matter, like the frontend's star matching (meals/stars.ts). */
	static String normalize(String name) {
		return Normalizer.normalize(name, Normalizer.Form.NFKC).trim().replaceAll("\\s+", " ").toLowerCase(Locale.ENGLISH);
	}

	private static String key(Occurrence occurrence) {
		return occurrence.date() + "|" + normalize(occurrence.dish());
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(ZURICH));
	}

	/**
	 * Saves or updates a subscription with its starred dishes. Newly starred dishes that are already on a
	 * menu count as known: the user has just seen them.
	 *
	 * @throws IllegalArgumentException for an endpoint outside the known push services or malformed keys
	 */
	public PushSubscriptionEntity subscribe(String endpoint, String p256dh, String auth, String language, Collection<String> dishes) {
		if (!sender.isAllowedEndpoint(endpoint)) {
			throw new IllegalArgumentException("endpoint: not a known push service");
		}
		if (WebPushCrypto.fromBase64Url(p256dh).length != 65) {
			throw new IllegalArgumentException("keys.p256dh: not a P-256 public key");
		}
		WebPushCrypto.decodePublicKey(WebPushCrypto.fromBase64Url(p256dh));
		if (WebPushCrypto.fromBase64Url(auth).length != 16) {
			throw new IllegalArgumentException("keys.auth: must be 16 bytes");
		}
		Set<String> cleaned = dishes.stream().map(d -> Normalizer.normalize(d, Normalizer.Form.NFKC).trim().replaceAll("\\s+", " "))
				.filter(d -> !d.isEmpty()).collect(Collectors.toCollection(LinkedHashSet::new));

		PushSubscriptionEntity entity = subscriptions.findByEndpoint(endpoint).orElseGet(() -> new PushSubscriptionEntity(endpoint));
		Set<String> before = entity.getDishes().stream().map(StarredMealPushService::normalize).collect(Collectors.toSet());
		Set<String> added = cleaned.stream().map(StarredMealPushService::normalize).filter(d -> !before.contains(d)).collect(Collectors.toSet());
		entity.update(p256dh, auth, "de".equals(language) ? "de" : "en", cleaned, clock.instant());
		if (!added.isEmpty()) {
			occurrences(added).forEach(o -> entity.getNotified().add(key(o)));
		}
		return subscriptions.save(entity);
	}

	public void unsubscribe(String endpoint) {
		subscriptions.findByEndpoint(endpoint).ifPresent(subscriptions::delete);
	}

	/** A test notification to one subscription ("notifications are on"). */
	public Result sendTest(String endpoint) {
		PushSubscriptionEntity entity = subscriptions.findByEndpoint(endpoint)
				.orElseThrow(() -> new NotFoundException("No push subscription for this endpoint"));
		boolean de = "de".equals(entity.getLanguage());
		return send(entity, de ? "Benachrichtigungen sind an" : "Notifications are on",
				de ? "Wir melden uns, wenn ein markiertes Gericht wieder auf einem Menü steht."
						: "We'll let you know when a starred dish is back on a menu.", "/settings");
	}

	@Scheduled(cron = "${app.push.cron:0 30 9 * * *}", zone = "Europe/Zurich")
	public void scheduledRun() {
		if (enabled) {
			int sent = notifyStarredMeals();
			log.info("Starred-dish push: {} notifications sent", sent);
		}
	}

	/** One notification per subscription with new occurrences of its starred dishes. Returns how many were sent. */
	public int notifyStarredMeals() {
		List<PushSubscriptionEntity> all = subscriptions.findAll();
		if (all.isEmpty()) {
			return 0;
		}
		Set<String> wanted = all.stream().flatMap(s -> s.getDishes().stream()).map(StarredMealPushService::normalize).collect(Collectors.toSet());
		List<Occurrence> menu = occurrences(wanted);
		String cutoff = today().minusDays(1).toString();
		int sent = 0;
		for (PushSubscriptionEntity entity : all) {
			Set<String> dishes = entity.getDishes().stream().map(StarredMealPushService::normalize).collect(Collectors.toSet());
			List<Occurrence> fresh = menu.stream()
					.filter(o -> dishes.contains(normalize(o.dish())) && !entity.getNotified().contains(key(o))).toList();
			entity.getNotified().removeIf(k -> k.compareTo(cutoff) < 0);
			if (fresh.isEmpty()) {
				subscriptions.save(entity);
				continue;
			}
			Message message = message(fresh, "de".equals(entity.getLanguage()));
			Result result = send(entity, message.title(), message.body(), message.url());
			if (result.gone()) {
				continue; // deleted by send()
			}
			if (result.delivered()) {
				fresh.forEach(o -> entity.getNotified().add(key(o)));
				sent++;
			}
			subscriptions.save(entity);
		}
		return sent;
	}

	/** The starred dishes (normalized names) on the menus from today on, by date. */
	private List<Occurrence> occurrences(Set<String> normalizedDishes) {
		LocalDate today = today();
		List<Occurrence> found = new ArrayList<>();
		for (Mensa mensa : mensaService.getMensas(null)) {
			for (Meal meal : mensaService.getMeals(mensa.id(), today, today.plusDays(DAYS_AHEAD))) {
				if (meal.title() != null && normalizedDishes.contains(normalize(meal.title()))) {
					found.add(new Occurrence(meal.date(), meal.title(), mensa.id(), mensa.name()));
				}
			}
		}
		found.sort((a, b) -> a.date().compareTo(b.date()));
		return found;
	}

	record Message(String title, String body, String url) {
	}

	/** "Pad Thai is back" + one line per dish and day: "Pad Thai · today · Mensa Polyterrasse, Clausiusbar". */
	Message message(List<Occurrence> fresh, boolean de) {
		Map<String, List<Occurrence>> byDishAndDay = new TreeMap<>();
		for (Occurrence o : fresh) {
			byDishAndDay.computeIfAbsent(key(o), k -> new ArrayList<>()).add(o);
		}
		Map<String, String> dishNames = new LinkedHashMap<>();
		fresh.forEach(o -> dishNames.putIfAbsent(normalize(o.dish()), o.dish()));
		List<String> lines = new ArrayList<>();
		for (List<Occurrence> group : byDishAndDay.values()) {
			Occurrence first = group.get(0);
			String mensas = group.stream().map(Occurrence::mensaName).distinct().collect(Collectors.joining(", "));
			lines.add(first.dish() + " · " + day(first.date(), de) + " · " + mensas);
		}
		String body = String.join("\n", lines.subList(0, Math.min(MAX_LINES, lines.size())))
				+ (lines.size() > MAX_LINES ? "\n" + (de ? "+" + (lines.size() - MAX_LINES) + " weitere" : "+" + (lines.size() - MAX_LINES) + " more") : "");
		String title = dishNames.size() == 1
				? (de ? dishNames.values().iterator().next() + " ist wieder da" : dishNames.values().iterator().next() + " is back on the menu")
				: (de ? dishNames.size() + " deiner markierten Gerichte sind wieder da" : dishNames.size() + " of your starred dishes are back");
		Occurrence first = fresh.get(0);
		String url = "/canteen/" + first.mensaId() + (first.date().equals(mensaService.getMenuDate(today())) ? "" : "/" + first.date());
		return new Message(title, body, url);
	}

	private String day(LocalDate date, boolean de) {
		LocalDate today = today();
		if (date.equals(today)) {
			return de ? "heute" : "today";
		}
		if (date.equals(today.plusDays(1))) {
			return de ? "morgen" : "tomorrow";
		}
		return date.format(DateTimeFormatter.ofPattern(de ? "EEE d. MMM" : "EEE d MMM", de ? Locale.GERMAN : Locale.ENGLISH));
	}

	private Result send(PushSubscriptionEntity entity, String title, String body, String url) {
		String payload = "{\"title\":" + json(title) + ",\"body\":" + json(body) + ",\"url\":" + json(url) + ",\"tag\":\"starred-dishes\"}";
		Result result = sender.send(new PushTarget(entity.getEndpoint(), entity.getP256dh(), entity.getAuth()), payload);
		if (result.gone()) {
			subscriptions.delete(entity);
		}
		return result;
	}

	private static String json(String value) {
		StringBuilder out = new StringBuilder("\"");
		for (char c : value.toCharArray()) {
			switch (c) {
				case '"' -> out.append("\\\"");
				case '\\' -> out.append("\\\\");
				case '\n' -> out.append("\\n");
				default -> {
					if (c < 0x20) {
						out.append(String.format("\\u%04x", (int) c));
					} else {
						out.append(c);
					}
				}
			}
		}
		return out.append('"').toString();
	}

}
