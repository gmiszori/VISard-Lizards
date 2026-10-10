package com.visardlizards.backend.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.service.push.StarredMealPushService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Runs the daily starred-dish push job on demand. Trusted local/admin use only (app.internal-api.enabled). */
@RestController
@RequestMapping("/api/push")
@ConditionalOnProperty(name = "app.internal-api.enabled", havingValue = "true")
@Tag(name = "Push", description = "Web Push notifications when a starred dish is back on a menu")
public class InternalPushController {

	public record RunResultDTO(int sent) {
	}

	private final StarredMealPushService pushService;

	public InternalPushController(StarredMealPushService pushService) {
		this.pushService = pushService;
	}

	@PostMapping("/run")
	@Operation(summary = "Run the daily starred-dish check now (internal)", description = """
			Runs the job that normally runs at 09:30 Zurich and returns how many notifications were sent.
			With `forgetAnnounced=true` every subscription first forgets which dishes it was told about, so
			starred dishes on the current menus are announced again (for testing). Only available with
			`app.internal-api.enabled=true` (env INTERNAL_API_ENABLED).
			""")
	public RunResultDTO run(@Parameter(description = "Announce dishes again that were already announced or known")
			@RequestParam(defaultValue = "false") boolean forgetAnnounced) {
		if (forgetAnnounced) {
			pushService.forgetAnnounced();
		}
		return new RunResultDTO(pushService.notifyStarredMeals());
	}

}
