package com.visardlizards.backend.service.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.visardlizards.backend.model.db.PushSubscriptionEntity;
import com.visardlizards.backend.model.domain.Meal;
import com.visardlizards.backend.model.domain.Mensa;
import com.visardlizards.backend.repository.PushSubscriptionEntityRepository;
import com.visardlizards.backend.service.MensaService;
import com.visardlizards.backend.service.push.WebPushSender.PushTarget;
import com.visardlizards.backend.service.push.WebPushSender.Result;

class StarredMealPushServiceTests {

	private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
	private static final String P256DH = WebPushCrypto.base64Url(WebPushCrypto.encodePublicKey((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
	private static final String AUTH = WebPushCrypto.base64Url(new byte[16]);
	/** Monday 2026-10-12, 09:30 in Zurich. */
	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 12);

	private final Map<String, PushSubscriptionEntity> stored = new LinkedHashMap<>();
	private final List<Meal> meals = new ArrayList<>();
	private final PushSubscriptionEntityRepository repository = mock(PushSubscriptionEntityRepository.class);
	private final MensaService mensaService = mock(MensaService.class);
	private final WebPushSender sender = mock(WebPushSender.class);
	private StarredMealPushService service;

	private static Meal meal(String title, LocalDate date) {
		return new Meal("polyterrasse." + date + ".lunch." + title.length(), "polyterrasse", date, "lunch", "", "main", title,
				List.of(), "vegan", null, List.of(), null, null);
	}

	@BeforeEach
	void setUp() {
		Mensa mensa = mock(Mensa.class);
		when(mensa.id()).thenReturn("polyterrasse");
		when(mensa.name()).thenReturn("Mensa Polyterrasse");
		when(mensaService.getMensas(null)).thenReturn(List.of(mensa));
		when(mensaService.getMeals(eq("polyterrasse"), any(), any())).thenAnswer(call -> List.copyOf(meals));
		when(mensaService.getMenuDate(any())).thenReturn(MONDAY);
		when(repository.findByEndpoint(anyString())).thenAnswer(call -> Optional.ofNullable(stored.get(call.<String>getArgument(0))));
		when(repository.save(any())).thenAnswer(call -> {
			PushSubscriptionEntity entity = call.getArgument(0);
			stored.put(entity.getEndpoint(), entity);
			return entity;
		});
		when(repository.findAll()).thenAnswer(call -> List.copyOf(stored.values()));
		org.mockito.Mockito.doAnswer(call -> stored.remove(call.<PushSubscriptionEntity>getArgument(0).getEndpoint()))
				.when(repository).delete(any());
		when(sender.isAllowedEndpoint(anyString())).thenAnswer(call -> call.<String>getArgument(0).startsWith("https://fcm.googleapis.com/"));
		when(sender.send(any(), anyString())).thenReturn(new Result(201));
		Clock clock = Clock.fixed(Instant.parse("2026-10-12T07:30:00Z"), ZoneOffset.UTC);
		service = new StarredMealPushService(repository, mensaService, sender, clock, true);
	}

	@Test
	void aDishAlreadyOnTheMenuWhenStarredDoesNotTriggerAPush() {
		meals.add(meal("Pad Thai", MONDAY));
		service.subscribe(ENDPOINT, P256DH, AUTH, "en", List.of("Pad Thai"));

		assertThat(service.notifyStarredMeals()).isZero();
		verify(sender, never()).send(any(), anyString());
	}

	@Test
	void aDishBackOnANewMenuIsAnnouncedOnce() {
		service.subscribe(ENDPOINT, P256DH, AUTH, "en", List.of("pad  thai"));
		meals.add(meal("Pad Thai", MONDAY.plusDays(2)));

		assertThat(service.notifyStarredMeals()).isEqualTo(1);
		ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
		verify(sender).send(eq(new PushTarget(ENDPOINT, P256DH, AUTH)), payload.capture());
		assertThat(payload.getValue()).contains("\"title\":\"Pad Thai is back on the menu\"",
				"Pad Thai · Wed 14 Oct · Mensa Polyterrasse", "\"url\":\"/canteen/polyterrasse/2026-10-14\"");

		assertThat(service.notifyStarredMeals()).as("already announced").isZero();
		verify(sender, times(1)).send(any(), anyString());
	}

	@Test
	void severalDishesGoIntoOneGermanNotification() {
		service.subscribe(ENDPOINT, P256DH, AUTH, "de", List.of("Pad Thai", "Rösti"));
		meals.add(meal("Pad Thai", MONDAY));
		meals.add(meal("Rösti", MONDAY.plusDays(1)));

		assertThat(service.notifyStarredMeals()).isEqualTo(1);
		ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
		verify(sender).send(any(), payload.capture());
		assertThat(payload.getValue()).contains("2 deiner markierten Gerichte sind wieder da", "Pad Thai · heute",
				"Rösti · morgen", "\"url\":\"/canteen/polyterrasse\"");
	}

	@Test
	void goneSubscriptionsAreDeleted() {
		service.subscribe(ENDPOINT, P256DH, AUTH, "en", List.of("Pad Thai"));
		meals.add(meal("Pad Thai", MONDAY.plusDays(1)));
		when(sender.send(any(), anyString())).thenReturn(new Result(410));

		assertThat(service.notifyStarredMeals()).isZero();
		assertThat(stored).isEmpty();
	}

	@Test
	void undeliveredMessagesAreTriedAgainNextTime() {
		service.subscribe(ENDPOINT, P256DH, AUTH, "en", List.of("Pad Thai"));
		meals.add(meal("Pad Thai", MONDAY.plusDays(1)));
		when(sender.send(any(), anyString())).thenReturn(new Result(-1)).thenReturn(new Result(201));

		assertThat(service.notifyStarredMeals()).isZero();
		assertThat(service.notifyStarredMeals()).isEqualTo(1);
	}

	@Test
	void rejectsUnknownPushServicesAndBadKeys() {
		assertThatThrownBy(() -> service.subscribe("https://evil.example.com/x", P256DH, AUTH, "en", List.of()))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> service.subscribe(ENDPOINT, AUTH, AUTH, "en", List.of()))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> service.subscribe(ENDPOINT, P256DH, P256DH, "en", List.of()))
				.isInstanceOf(IllegalArgumentException.class);
	}

}
