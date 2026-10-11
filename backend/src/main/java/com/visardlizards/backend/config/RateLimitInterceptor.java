package com.visardlizards.backend.config;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import org.springframework.web.servlet.HandlerInterceptor;

import com.visardlizards.backend.exception.TooManyRequestsException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Lets each client send a POST to the same path (e.g. rating one mensa) only once per window.
 * Clients are identified by their IP address; behind a reverse proxy, configure
 * server.forward-headers-strategy so the real client address is used. Kept in memory, so limits reset
 * on restart.
 */
public class RateLimitInterceptor implements HandlerInterceptor {

	private final Duration window;
	private final String what;
	private final Clock clock;
	private final Cache<String, Instant> lastAccepted;

	/** @param what describes the action for the error message, e.g. "rate this again" */
	public RateLimitInterceptor(Duration window, String what, Clock clock) {
		this.window = window;
		this.what = what;
		this.clock = clock;
		this.lastAccepted = Caffeine.newBuilder()
				.maximumSize(50_000)
				.expireAfterWrite(window)
				.build();
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (!"POST".equals(request.getMethod())) {
			return true;
		}
		Instant now = clock.instant();
		String key = request.getRemoteAddr() + " " + request.getRequestURI();
		Instant previous = lastAccepted.asMap().putIfAbsent(key, now);
		if (previous != null && previous.plus(window).isAfter(now)) {
			Duration retryAfter = Duration.between(now, previous.plus(window));
			throw new TooManyRequestsException("You can " + what + " in " + format(retryAfter) + ".", retryAfter);
		}
		return true;
	}

	private static String format(Duration duration) {
		if (duration.toSeconds() < 60) return Math.max(1, (duration.toMillis() + 999) / 1000) + " seconds";
		long minutes = (duration.toSeconds() + 59) / 60;
		return minutes >= 60 ? (minutes + 59) / 60 + " hours" : minutes + " minutes";
	}

}
