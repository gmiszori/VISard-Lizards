package com.visardlizards.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

/** Title and general conventions shown at the top of the Swagger UI. Keep in sync with backend/API.md. */
@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI openApi() {
		return new OpenAPI().info(new Info()
				.title("VISard Lizards Backend API")
				.version("0.0.1")
				.description("""
						Mensas, meal plans, ratings and crowd reports of the ETH and UZH mensas in Zurich.

						**Data:** mensas, meals, ratings and crowd reports are stored in the backend's database. Mensas and
						meals come from a snapshot of the frontend database (22 mensas, 901 meals, 2026-09-28 to 2026-10-09).
						ETH menus of the current and next week are imported live every 6 hours; UZH menus are not imported
						live yet (needs a ZFV API key).

						**Conventions**
						- Dates: `YYYY-MM-DD`. Times: `HH:mm`.
						- **Today** is today in Zurich, independent of the server's time zone.
						- **Menu date**: today if there are meals for it, otherwise the next day with meals within a week
						  (e.g. Monday on weekends), otherwise the latest earlier day with meals.
						- `priceCategory`: `STUDENT` (default), `STAFF`, `EXTERNAL`.
						- Mensa ids look like `polyterrasse`, meal ids like `polyterrasse.2026-10-06.lunch.2`.
						- Errors are RFC 9457 problem details, e.g.
						  `{"status": 404, "title": "Not Found", "detail": "Mensa not found: xyz"}`.
						  Unknown ids return 404; invalid parameters or bodies return 400.
						  For an invalid body, `detail` names the field, e.g. `"stars: must be less than or equal to 5"`.
						"""));
	}

}
