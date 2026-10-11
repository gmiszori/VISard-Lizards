package com.visardlizards.backend.config;

import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import com.visardlizards.backend.exception.TooManyRequestsException;
import static org.junit.jupiter.api.Assertions.*;

class RouteRateLimitTests {
    private MockHttpServletRequest request() {
        var request=new MockHttpServletRequest("POST","/api/route-planner/plan");request.setRemoteAddr("127.0.0.1");return request;
    }
    @Test void failedRouteAttemptReleasesItsReservationButSuccessfulAttemptKeepsCooldown() {
        var limit=new RateLimitInterceptor(Duration.ofSeconds(10),"plan",Clock.systemUTC(),true);
        var failed=request();var response=new MockHttpServletResponse();
        assertTrue(limit.preHandle(failed,response,this));response.setStatus(502);limit.afterCompletion(failed,response,this,null);
        var success=request();var ok=new MockHttpServletResponse();assertTrue(limit.preHandle(success,ok,this));limit.afterCompletion(success,ok,this,null);
        assertThrows(TooManyRequestsException.class,()->limit.preHandle(request(),new MockHttpServletResponse(),this));
    }
    @Test void rejectedConcurrentRequestCannotReleaseAnotherRequestsReservation() {
        var limit=new RateLimitInterceptor(Duration.ofSeconds(10),"plan",Clock.systemUTC(),true);
        assertTrue(limit.preHandle(request(),new MockHttpServletResponse(),this));
        var rejected=request();var response=new MockHttpServletResponse();response.setStatus(429);
        assertThrows(TooManyRequestsException.class,()->limit.preHandle(rejected,response,this));limit.afterCompletion(rejected,response,this,null);
        assertThrows(TooManyRequestsException.class,()->limit.preHandle(request(),new MockHttpServletResponse(),this));
    }
}
