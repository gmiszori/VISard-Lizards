package com.visardlizards.backend.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

	/**
	 * All mensas are in Zurich, so "today" is Zurich's today regardless of the server's time zone.
	 * Injected instead of calling now() directly, so tests can use a fixed clock.
	 */
	@Bean
	public Clock clock() {
		return Clock.system(ZoneId.of("Europe/Zurich"));
	}

}
