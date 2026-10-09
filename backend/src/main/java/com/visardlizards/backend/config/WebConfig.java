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

	/** Comma-separated origins, set app.cors.allowed-origins in application.properties. */
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
				.allowedOrigins(allowedOrigins)
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
				.addPathPatterns("/api/mensas/*/ratings", "/api/meals/*/ratings");
		registry.addInterceptor(new RateLimitInterceptor(crowdReportWindow, "report this mensa again", clock))
				.addPathPatterns("/api/mensas/*/crowd-reports");
	}

}
