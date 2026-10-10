package com.visardlizards.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Enables @Scheduled jobs, e.g. the live menu import in LiveMenuImportService. */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
