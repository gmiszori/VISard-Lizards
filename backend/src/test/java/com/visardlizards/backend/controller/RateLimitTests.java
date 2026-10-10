package com.visardlizards.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = "app.rate-limit.enabled=true")
@AutoConfigureMockMvc
class RateLimitTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void secondRatingOfTheSameMensaIsRejected() throws Exception {
		mockMvc.perform(rate("/api/mensas/tannenbar/ratings", "10.0.0.1")).andExpect(status().isCreated());
		mockMvc.perform(rate("/api/mensas/tannenbar/ratings", "10.0.0.1"))
				.andExpect(status().isTooManyRequests())
				.andExpect(header().string("Retry-After", "86400"))
				.andExpect(jsonPath("$.detail").value("You can rate this again in 24 hours."));
	}

	@Test
	void limitsArePerClientAndPerTarget() throws Exception {
		mockMvc.perform(rate("/api/mensas/clausiusbar/ratings", "10.0.0.2")).andExpect(status().isCreated());
		mockMvc.perform(rate("/api/mensas/clausiusbar/ratings", "10.0.0.3")).andExpect(status().isCreated());
		mockMvc.perform(rate("/api/mensas/dozentenfoyer/ratings", "10.0.0.2")).andExpect(status().isCreated());
	}

	@Test
	void crowdReportsAreLimitedPerMensa() throws Exception {
		MockHttpServletRequestBuilder report = post("/api/mensas/polysnack/crowd-reports")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"level\": 2}")
				.with(request -> {
					request.setRemoteAddr("10.0.0.4");
					return request;
				});
		mockMvc.perform(report).andExpect(status().isCreated());
		mockMvc.perform(report)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().string("Retry-After", "300"));
	}

	private static MockHttpServletRequestBuilder rate(String path, String clientIp) {
		return post(path)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"stars\": 4}")
				.with(request -> {
					request.setRemoteAddr(clientIp);
					return request;
				});
	}

}
