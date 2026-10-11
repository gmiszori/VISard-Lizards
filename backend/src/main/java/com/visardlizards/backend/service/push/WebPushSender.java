package com.visardlizards.backend.service.push;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Sends encrypted messages to push services (Google FCM, Mozilla, Microsoft, Apple). Only these hosts are
 * accepted as subscription endpoints, so the server never posts to an address a client made up.
 */
@Component
public class WebPushSender {

	/** Host suffixes of the browsers' push services; extend with app.push.extra-hosts. */
	private static final List<String> PUSH_SERVICE_HOSTS = List.of(
			"fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com");

	/** The push service keeps an undelivered message this long, e.g. while the phone is off. */
	private static final Duration TTL = Duration.ofHours(12);

	/** The result of one send: the push service's HTTP status (-1 if it could not be reached) and its error text. */
	public record Result(int status, String detail) {

		public Result(int status) {
			this(status, "");
		}

		public boolean delivered() {
			return status >= 200 && status < 300;
		}

		/** 404 and 410: the subscription is gone (unsubscribed, expired) and should be deleted. */
		public boolean gone() {
			return status == 404 || status == 410;
		}
	}

	private final VapidKeys keys;
	private final String subject;
	private final List<String> extraHosts;
	private final Clock clock;
	// Apple's Web Push endpoint requires HTTP/2; other push services still work when HTTP/2 is preferred.
	private final HttpClient http = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_2).connectTimeout(Duration.ofSeconds(10)).build();

	public WebPushSender(VapidKeys keys, @Value("${app.push.subject:mailto:unieats@example.com}") String subject,
			@Value("${app.push.extra-hosts:}") List<String> extraHosts, Clock clock) {
		this.keys = keys;
		this.subject = subject;
		this.extraHosts = extraHosts.stream().map(String::trim).filter(h -> !h.isEmpty()).toList();
		this.clock = clock;
	}

	/** https and a known push service host. */
	public boolean isAllowedEndpoint(String endpoint) {
		URI uri;
		try {
			uri = URI.create(endpoint);
		} catch (IllegalArgumentException e) {
			return false;
		}
		if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
			return false;
		}
		String host = uri.getHost().toLowerCase(Locale.ROOT);
		return PUSH_SERVICE_HOSTS.stream().anyMatch(allowed -> host.equals(allowed) || host.endsWith("." + allowed))
				|| extraHosts.stream().anyMatch(host::equals);
	}

	public Result send(PushTarget target, String payloadJson) {
		if (!isAllowedEndpoint(target.endpoint())) {
			return new Result(410);
		}
		URI endpoint = URI.create(target.endpoint());
		byte[] body = WebPushCrypto.encrypt(payloadJson.getBytes(StandardCharsets.UTF_8),
				WebPushCrypto.fromBase64Url(target.p256dh()), WebPushCrypto.fromBase64Url(target.auth()));
		HttpRequest request = HttpRequest.newBuilder(endpoint)
				.timeout(Duration.ofSeconds(15))
				.header("Content-Encoding", "aes128gcm")
				.header("Content-Type", "application/octet-stream")
				.header("TTL", String.valueOf(TTL.toSeconds()))
				.header("Urgency", "normal")
				.header("Authorization", WebPushCrypto.vapidAuthorization(endpoint, subject, keys.publicKey(), keys.privateKey(), clock.instant()))
				.POST(HttpRequest.BodyPublishers.ofByteArray(body))
				.build();
		try {
			HttpResponse<String> response;
			try {
				response = http.send(request, HttpResponse.BodyHandlers.ofString());
			} catch (IOException firstTry) {
				// A pooled connection the push service has closed in the meantime ("Connection reset", seen with
				// Microsoft's WNS): one retry on a fresh connection.
				response = http.send(request, HttpResponse.BodyHandlers.ofString());
			}
			int status = response.statusCode();
			// The push services explain rejections in the body (e.g. a VAPID or encryption problem).
			String detail = status >= 300 ? response.body().replaceAll("\\s+", " ").trim() : "";
			return new Result(status, detail.length() > 300 ? detail.substring(0, 300) : detail);
		} catch (IOException e) {
			return new Result(-1, e.getClass().getSimpleName() + ": " + e.getMessage());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return new Result(-1);
		}
	}

	/** Where and how to send: a subscription's endpoint and keys. */
	public record PushTarget(String endpoint, String p256dh, String auth) {
	}

}
