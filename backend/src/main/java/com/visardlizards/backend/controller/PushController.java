package com.visardlizards.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.db.PushSubscriptionEntity;
import com.visardlizards.backend.model.dto.PushSubscriptionRequestDTO;
import com.visardlizards.backend.service.push.StarredMealPushService;
import com.visardlizards.backend.service.push.VapidKeys;
import com.visardlizards.backend.service.push.WebPushSender.Result;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// The @Operation descriptions are shown in the Swagger UI; keep them in sync with backend/API.md.
@RestController
@RequestMapping("/api/push")
@Tag(name = "Push", description = "Web Push notifications when a starred dish is back on a menu")
public class PushController {

	public record PublicKeyDTO(String publicKey) {
	}

	public record EndpointDTO(@NotBlank @Size(max = 4096) String endpoint) {
	}

	public record SubscriptionDTO(String endpoint, List<String> dishes, String language) {
	}

	public record TestResultDTO(boolean delivered, int pushServiceStatus) {
	}

	private final StarredMealPushService pushService;
	private final VapidKeys keys;

	public PushController(StarredMealPushService pushService, VapidKeys keys) {
		this.pushService = pushService;
		this.keys = keys;
	}

	@GetMapping("/public-key")
	@Operation(summary = "The server's VAPID public key", description = """
			The key to pass as `applicationServerKey` to `PushManager.subscribe()` (base64url, uncompressed P-256 point).
			Subscriptions made with another key cannot receive notifications from this server.
			""")
	public PublicKeyDTO publicKey() {
		return new PublicKeyDTO(keys.publicKeyBase64Url());
	}

	@PutMapping("/subscription")
	@Operation(summary = "Subscribe, or update the starred dishes", description = """
			Saves a browser's push subscription (`PushSubscription.toJSON()`: `endpoint` and `keys`) with the
			starred dishes it wants to hear about, or replaces the dishes of an existing subscription with the
			same endpoint. There are no accounts: the endpoint identifies the subscription.

			Once a day (09:30 Zurich) every subscription gets at most one notification, listing the starred
			dishes that appear on a menu from today on that it was not told about yet. A dish that is already on
			a menu when it is starred does not trigger a notification for that day; the next time it appears does.
			Dish names match ignoring case and spacing, like the stars in the app.

			Only endpoints of the browsers' push services are accepted (Google, Mozilla, Microsoft, Apple).
			""")
	@ApiResponse(responseCode = "200", description = "The saved subscription")
	@ApiResponse(responseCode = "400", description = "Unknown push service, malformed keys or invalid body")
	public SubscriptionDTO subscribe(@Valid @RequestBody PushSubscriptionRequestDTO request) {
		PushSubscriptionEntity saved = pushService.subscribe(request.endpoint(), request.keys().p256dh(), request.keys().auth(),
				request.language() == null ? "en" : request.language(), request.dishes());
		return new SubscriptionDTO(saved.getEndpoint(), List.copyOf(saved.getDishes()), saved.getLanguage());
	}

	@DeleteMapping("/subscription")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Unsubscribe", description = """
			Deletes the subscription with this endpoint and its starred dishes. Unknown endpoints are ignored.
			""")
	@ApiResponse(responseCode = "204", description = "Deleted (or there was nothing to delete)")
	public void unsubscribe(@Valid @RequestBody EndpointDTO request) {
		pushService.unsubscribe(request.endpoint());
	}

	@PostMapping("/test")
	@Operation(summary = "Send a test notification", description = """
			Sends "Notifications are on" to the subscription with this endpoint, so a user can check that
			notifications arrive. Each client (IP address) can send one test per minute.
			""")
	@ApiResponse(responseCode = "200", description = "Whether the push service accepted the message, and its HTTP status")
	@ApiResponse(responseCode = "404", description = "No subscription with this endpoint")
	@ApiResponse(responseCode = "429", description = "Already sent a test in the last minute (see `Retry-After`)")
	public ResponseEntity<TestResultDTO> test(@Valid @RequestBody EndpointDTO request) {
		Result result = pushService.sendTest(request.endpoint());
		return ResponseEntity.ok(new TestResultDTO(result.delivered(), result.status()));
	}

}
