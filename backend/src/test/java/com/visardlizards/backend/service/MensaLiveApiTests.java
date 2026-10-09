package com.visardlizards.backend.service;

import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Opt-in network checks; normal builds do not depend on upstream availability. */
@EnabledIfEnvironmentVariable(named = "MENSA_LIVE_TESTS", matches = "true")
class MensaLiveApiTests {

    @Test
    void ethLivePaginationReturnsValidRawPages() {
        LocalDate date = LocalDate.now(ZoneId.of("Europe/Zurich"));
        var pages = new EthMensaClient().fetchWeeklyRotaPages(date, "en");
        var mapper = JsonMapper.builder().build();
        assertFalse(pages.isEmpty());
        int entries = 0;
        for (String page : pages) {
            var rotas = mapper.readTree(page).path("weekly-rota-array");
            assertTrue(rotas.isArray(), "Expected the ETH weekly-rota-array");
            entries += rotas.size();
        }
        System.out.printf("ETH live check: %d pages, %d weekly rota entries%n", pages.size(), entries);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "MENSA_ZFV_API_KEY", matches = ".+")
    void zfvLiveWeekReturnsAuthorizedMenuData() {
        String json = new ZfvMensaClient(System.getenv("MENSA_ZFV_API_KEY")).fetchThisWeek();
        var root = JsonMapper.builder().build().readTree(json);
        assertFalse(root.path("errors").isArray() && !root.path("errors").isEmpty(),
                "ZFV returned GraphQL errors; verify your key and its permissions");
        var outlets = root.path("data").path("organisation").path("outlets");
        assertTrue(outlets.isArray(), "Expected authorized ZFV outlet data");
        System.out.printf("ZFV live check: %d outlets%n", outlets.size());
    }
}
