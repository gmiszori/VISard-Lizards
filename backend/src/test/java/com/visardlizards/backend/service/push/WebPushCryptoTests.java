package com.visardlizards.backend.service.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WebPushCryptoTests {

	/** Decrypts like a browser does (RFC 8291), with the subscription's private key and auth secret. */
	private static byte[] decrypt(byte[] body, ECPrivateKey userAgentPrivate, byte[] userAgentPublic, byte[] auth) throws Exception {
		ByteBuffer buffer = ByteBuffer.wrap(body);
		byte[] salt = new byte[16];
		buffer.get(salt);
		assertThat(buffer.getInt()).isEqualTo(4096);
		byte[] serverPublic = new byte[buffer.get()];
		buffer.get(serverPublic);
		byte[] ciphertext = new byte[buffer.remaining()];
		buffer.get(ciphertext);

		byte[] secret = WebPushCrypto.ecdh(userAgentPrivate, WebPushCrypto.decodePublicKey(serverPublic));
		byte[][] keys = WebPushCrypto.contentKeys(secret, auth, userAgentPublic, serverPublic, salt);
		Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
		cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keys[0], "AES"), new GCMParameterSpec(128, keys[1]));
		byte[] record = cipher.doFinal(ciphertext);
		assertThat(record[record.length - 1]).as("last-record delimiter").isEqualTo((byte) 2);
		return Arrays.copyOf(record, record.length - 1);
	}

	@Test
	void browserCanDecryptTheMessage() throws Exception {
		KeyPair userAgent = WebPushCrypto.newKeyPair();
		byte[] userAgentPublic = WebPushCrypto.encodePublicKey((ECPublicKey) userAgent.getPublic());
		byte[] auth = new byte[16];
		new java.security.SecureRandom().nextBytes(auth);
		byte[] message = "{\"title\":\"Pad Thai is back\"}".getBytes(StandardCharsets.UTF_8);

		byte[] body = WebPushCrypto.encrypt(message, userAgentPublic, auth);

		assertThat(decrypt(body, (ECPrivateKey) userAgent.getPrivate(), userAgentPublic, auth)).isEqualTo(message);
	}

	@Test
	void keysSurviveEncoding() {
		KeyPair pair = WebPushCrypto.newKeyPair();
		byte[] publicBytes = WebPushCrypto.encodePublicKey((ECPublicKey) pair.getPublic());
		assertThat(publicBytes).hasSize(65);
		assertThat(WebPushCrypto.decodePublicKey(publicBytes)).isEqualTo(pair.getPublic());
		byte[] privateBytes = WebPushCrypto.encodePrivateKey((ECPrivateKey) pair.getPrivate());
		assertThat(WebPushCrypto.decodePrivateKey(privateBytes).getS()).isEqualTo(((ECPrivateKey) pair.getPrivate()).getS());
		assertThat(WebPushCrypto.fromBase64Url(WebPushCrypto.base64Url(publicBytes) + "=")).isEqualTo(publicBytes);
	}

	@Test
	void vapidTokenIsASignedJwtForThePushServiceOrigin() throws Exception {
		KeyPair pair = WebPushCrypto.newKeyPair();
		Instant now = Instant.parse("2026-10-12T07:30:00Z");
		String header = WebPushCrypto.vapidAuthorization(URI.create("https://fcm.googleapis.com/fcm/send/abc"), "mailto:team@example.com",
				(ECPublicKey) pair.getPublic(), (ECPrivateKey) pair.getPrivate(), now);

		assertThat(header).startsWith("vapid t=").contains(", k=" + WebPushCrypto.base64Url(WebPushCrypto.encodePublicKey((ECPublicKey) pair.getPublic())));
		String jwt = header.substring("vapid t=".length(), header.indexOf(','));
		String[] parts = jwt.split("\\.");
		String claims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
		assertThat(claims).contains("\"aud\":\"https://fcm.googleapis.com\"", "\"sub\":\"mailto:team@example.com\"",
				"\"exp\":" + now.plusSeconds(12 * 3600).getEpochSecond());
		Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
		verifier.initVerify(pair.getPublic());
		verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
		assertThat(verifier.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
	}

	@Test
	void vapidKeysAreCreatedOnceAndReused(@TempDir Path dir) throws Exception {
		Path file = dir.resolve("keys.properties");
		VapidKeys first = new VapidKeys("", "", file.toString());
		assertThat(Files.exists(file)).isTrue();
		assertThat(new VapidKeys("", "", file.toString()).publicKeyBase64Url()).isEqualTo(first.publicKeyBase64Url());
	}

	@Test
	void onlyPushServicesAreAllowedAsEndpoints(@TempDir Path dir) {
		WebPushSender sender = new WebPushSender(new VapidKeys("", "", dir.resolve("k").toString()), "mailto:x@example.com",
				List.of(""), Clock.systemUTC());
		assertThat(sender.isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).isTrue();
		assertThat(sender.isAllowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).isTrue();
		assertThat(sender.isAllowedEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).isTrue();
		assertThat(sender.isAllowedEndpoint("https://web.push.apple.com/abc")).isTrue();
		assertThat(sender.isAllowedEndpoint("http://fcm.googleapis.com/fcm/send/abc")).isFalse();
		assertThat(sender.isAllowedEndpoint("https://evil.example.com/fcm.googleapis.com")).isFalse();
		assertThat(sender.isAllowedEndpoint("https://fcm.googleapis.com.evil.example/abc")).isFalse();
		assertThat(sender.isAllowedEndpoint("https://user@fcm.googleapis.com/abc")).isFalse();
		assertThat(sender.isAllowedEndpoint("https://localhost:8080/api")).isFalse();
		assertThat(sender.isAllowedEndpoint("not a url")).isFalse();
	}

}
