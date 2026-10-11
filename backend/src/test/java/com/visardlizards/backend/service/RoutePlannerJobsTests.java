package com.visardlizards.backend.service;

import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class RoutePlannerJobsTests {
    private final JsonMapper mapper = JsonMapper.builder().build();
    @Test void submissionAndPollingReturnWhileProviderIsBlockedAndRejectExtraWork() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var jobs = new RoutePlannerJobs(mapper);
        try {
            String id = jobs.start(() -> {
                entered.countDown();
                try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); }
                return mapper.createObjectNode().put("planId", "verified-plan");
            }).path("jobId").asText();
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertEquals("running", jobs.status(id).path("status").asText());
            assertEquals(429, assertThrows(ResponseStatusException.class, () -> jobs.start(() -> mapper.createObjectNode())).getStatusCode().value());
            release.countDown();
            assertEquals("verified-plan", completed(jobs,id).path("result").path("planId").asText());
            assertEquals(HttpStatus.GONE, assertThrows(ResponseStatusException.class, () -> jobs.status("unknown")).getStatusCode());
        } finally { release.countDown(); jobs.close(); }
    }
    @Test void failedJobsPreserveSafeUserErrorsButDoNotExposeProviderSecrets() throws Exception {
        var jobs = new RoutePlannerJobs(mapper);
        try {
            String id = jobs.start(() -> { throw new RuntimeException("secret-key-in-provider-error"); }).path("jobId").asText();
            var result=completed(jobs,id);
            assertEquals("failed",result.path("status").asText());
            assertFalse(result.toString().contains("secret-key"));
            id=jobs.start(() -> { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose a future journey."); }).path("jobId").asText();
            result=completed(jobs,id);
            assertEquals(400,result.path("httpStatus").asInt());
            assertEquals("Choose a future journey.",result.path("detail").asText());
        } finally { jobs.close(); }
    }
    private JsonNode completed(RoutePlannerJobs jobs,String id) throws Exception {
        for(int i=0;i<500;i++) {
            var result=jobs.status(id);
            if(!"running".equals(result.path("status").asText())) return result;
            Thread.sleep(10);
        }
        fail("Job did not finish"); return null;
    }
}
