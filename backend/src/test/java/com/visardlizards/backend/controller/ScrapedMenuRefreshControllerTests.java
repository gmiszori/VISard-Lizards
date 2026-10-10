package com.visardlizards.backend.controller;

import org.junit.jupiter.api.Test;
import com.visardlizards.backend.service.ScrapedMenuRefreshService;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScrapedMenuRefreshControllerTests {
    @Test void rejectsMissingWrongAndUnconfiguredTokensWithoutStartingWork() {
        var service=mock(ScrapedMenuRefreshService.class);
        var controller=new ScrapedMenuRefreshController(service,"admin-secret-0123456789-0123456789");
        assertEquals(401,controller.refresh(null).getStatusCode().value());
        assertEquals(401,controller.refresh("Bearer wrong").getStatusCode().value());
        assertEquals(401,new ScrapedMenuRefreshController(service,"").refresh("Bearer ").getStatusCode().value());
        assertEquals(401,new ScrapedMenuRefreshController(service,"local-compose-connector-token").refresh("Bearer local-compose-connector-token").getStatusCode().value());
        verifyNoInteractions(service);
    }
    @Test void reportsAcceptedBusyAndUnavailableStates() {
        var service=mock(ScrapedMenuRefreshService.class);
        var controller=new ScrapedMenuRefreshController(service,"admin-secret-0123456789-0123456789");
        when(service.requestRefresh()).thenReturn(ScrapedMenuRefreshService.RefreshStatus.STARTED,
                ScrapedMenuRefreshService.RefreshStatus.ALREADY_RUNNING,
                ScrapedMenuRefreshService.RefreshStatus.DISABLED,
                ScrapedMenuRefreshService.RefreshStatus.NOT_CONFIGURED);
        var accepted=controller.refresh("Bearer admin-secret-0123456789-0123456789");
        assertEquals(202,accepted.getStatusCode().value());
        assertEquals("started",accepted.getBody().get("status"));
        assertEquals(409,controller.refresh("Bearer admin-secret-0123456789-0123456789").getStatusCode().value());
        assertEquals(503,controller.refresh("Bearer admin-secret-0123456789-0123456789").getStatusCode().value());
        assertEquals(503,controller.refresh("Bearer admin-secret-0123456789-0123456789").getStatusCode().value());
    }
}
