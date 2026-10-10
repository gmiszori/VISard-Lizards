package com.visardlizards.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.interfaces.ECPublicKey;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.visardlizards.backend.service.push.WebPushCrypto;

@SpringBootTest
@AutoConfigureMockMvc
class PushControllerTests {

	private static final String P256DH = WebPushCrypto.base64Url(WebPushCrypto.encodePublicKey((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
	private static final String AUTH = WebPushCrypto.base64Url(new byte[16]);

	@Autowired
	private MockMvc mockMvc;

	private static String subscription(String endpoint) {
		return "{\"endpoint\": \"" + endpoint + "\", \"keys\": {\"p256dh\": \"" + P256DH + "\", \"auth\": \"" + AUTH
				+ "\"}, \"dishes\": [\"Pad Thai\"], \"language\": \"de\"}";
	}

	@Test
	void publishesTheVapidPublicKey() throws Exception {
		mockMvc.perform(get("/api/push/public-key"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.publicKey").value(org.hamcrest.Matchers.matchesPattern("[A-Za-z0-9_-]{87}")));
	}

	@Test
	void subscribesUpdatesAndUnsubscribes() throws Exception {
		String endpoint = "https://fcm.googleapis.com/fcm/send/controller-test";
		mockMvc.perform(put("/api/push/subscription").contentType(MediaType.APPLICATION_JSON).content(subscription(endpoint)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dishes[0]").value("Pad Thai"))
				.andExpect(jsonPath("$.language").value("de"));
		mockMvc.perform(delete("/api/push/subscription").contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\": \"" + endpoint + "\"}"))
				.andExpect(status().isNoContent());
		mockMvc.perform(post("/api/push/test").contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\": \"" + endpoint + "\"}"))
				.andExpect(status().isNotFound());
	}

	@Test
	void acceptsLongAppleSubscriptionEndpoints() throws Exception {
		String longPath = "a".repeat(3000);
		String endpoint = "https://web.push.apple.com/" + longPath;
		mockMvc.perform(put("/api/push/subscription").contentType(MediaType.APPLICATION_JSON).content(subscription(endpoint)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.endpoint").value(endpoint));
	}

	@Test
	void rejectsEndpointsOutsideThePushServices() throws Exception {
		mockMvc.perform(put("/api/push/subscription").contentType(MediaType.APPLICATION_JSON)
						.content(subscription("https://internal.example.com/admin")))
				.andExpect(status().isBadRequest());
	}

}
