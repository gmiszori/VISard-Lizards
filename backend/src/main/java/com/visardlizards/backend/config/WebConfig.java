package com.visardlizards.backend.config;

import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	/** Comma-separated origins or patterns, set app.cors.allowed-origins in application.properties. */
	@Value("${app.cors.allowed-origins}")
	private String[] allowedOrigins;

	@Value("${app.rate-limit.enabled:true}")
	private boolean rateLimitEnabled;

	@Value("${app.rate-limit.rating-window:PT24H}")
	private Duration ratingWindow;

	@Value("${app.rate-limit.crowd-report-window:PT5M}")
	private Duration crowdReportWindow;

	private final Clock clock;

	/** The Clock bean is optional so that @WebMvcTest slices (which have no ClockConfig) still start. */
	public WebConfig(ObjectProvider<Clock> clock) {
		this.clock = clock.getIfAvailable(Clock::systemUTC);
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
				.allowedOriginPatterns(allowedOrigins)
				.allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
				.allowedHeaders("*");
	}

	/** Spam protection for the endpoints anyone can write to. */
	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		if (!rateLimitEnabled) {
			return;
		}
		registry.addInterceptor(new RateLimitInterceptor(ratingWindow, "rate this again", clock))
				.addPathPatterns("/api/mensas/*/ratings");
		// Meal ratings are limited per user instead (one per user and meal), so a whole campus network
		// behind one IP address can still rate the same meal.
		registry.addInterceptor(new RateLimitInterceptor(crowdReportWindow, "report this mensa again", clock))
				.addPathPatterns("/api/mensas/*/crowd-reports");
		registry.addInterceptor(new RateLimitInterceptor(Duration.ofSeconds(10), "search again", clock))
				.addPathPatterns("/api/search");
		registry.addInterceptor(new RateLimitInterceptor(Duration.ofSeconds(10), "start voice search again", clock))
				.addPathPatterns("/api/voice/realtime-session");
		registry.addInterceptor(new RateLimitInterceptor(Duration.ofSeconds(30), "generate another recipe", clock))
				.addPathPatterns("/api/recipes");
		registry.addInterceptor(new RateLimitInterceptor(Duration.ofMinutes(1), "send another test notification", clock))
				.addPathPatterns("/api/push/test");
		registry.addInterceptor(new RateLimitInterceptor(Duration.ofSeconds(10), "plan another meal route", clock, true))
				.addPathPatterns("/api/route-planner/plan", "/api/route-planner/plan/jobs");
	}

}
