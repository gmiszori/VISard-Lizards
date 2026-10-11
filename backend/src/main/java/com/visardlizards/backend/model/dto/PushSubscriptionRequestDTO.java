package com.visardlizards.backend.model.dto;

import java.util.List;

import org.jspecify.annotations.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** A browser's PushSubscription (as from PushSubscription.toJSON()) plus the starred dishes to watch. */
public record PushSubscriptionRequestDTO(
		@Schema(description = "The subscription's endpoint at the browser's push service",
				example = "https://fcm.googleapis.com/fcm/send/c1KrmpTuRm0:APA91bG...")
		// Apple Web Push endpoints can be substantially longer than 1 KB.
		@NotBlank @Size(max = 4096) String endpoint,
		@NotNull @Valid Keys keys,
		@Schema(description = "Starred dish names, as shown in the app", example = "[\"Pad Thai\", \"Vegetable Stroganoff\"]")
		@NotNull @Size(max = 100) List<@NotBlank @Size(max = 200) String> dishes,
		@Schema(description = "Language of the notifications: en (default) or de", example = "de")
		@Pattern(regexp = "en|de", message = "must be en or de") @Nullable String language) {

	public record Keys(
			@Schema(description = "The browser's P-256 public key, base64url", example = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM")
			@NotBlank @Size(max = 128) String p256dh,
			@Schema(description = "The auth secret, base64url (16 bytes)", example = "tBHItJI5svbpez7KI4CCXg")
			@NotBlank @Size(max = 64) String auth) {
	}

}
