package com.visardlizards.backend.service.push;

import java.math.BigInteger;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The cryptography of Web Push, with the JDK only: message encryption (RFC 8291, content coding
 * aes128gcm from RFC 8188) and the VAPID authorization header (RFC 8292, an ES256 JWT).
 * Keys are P-256; public keys travel as uncompressed points (65 bytes), base64url without padding,
 * which is what browsers give in PushSubscription.keys.p256dh and expect as applicationServerKey.
 */
public final class WebPushCrypto {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
	private static final Base64.Decoder B64_DECODE = Base64.getUrlDecoder();
	/** Record size in the aes128gcm header; one record holds the whole (small) message. */
	private static final int RECORD_SIZE = 4096;

	private WebPushCrypto() {
	}

	public static String base64Url(byte[] bytes) {
		return B64.encodeToString(bytes);
	}

	/** Accepts base64url with or without padding (and plain base64, which some browsers' JSON uses). */
	public static byte[] fromBase64Url(String value) {
		return B64_DECODE.decode(value.trim().replace('+', '-').replace('/', '_').replace("=", ""));
	}

	public static KeyPair newKeyPair() {
		try {
			KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
			generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
			return generator.generateKeyPair();
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException("P-256 is not available", e);
		}
	}

	private static ECParameterSpec p256() {
		return ((ECPublicKey) newKeyPair().getPublic()).getParams();
	}

	/** Uncompressed point: 0x04 || x || y, 65 bytes. */
	public static byte[] encodePublicKey(ECPublicKey key) {
		byte[] out = new byte[65];
		out[0] = 4;
		copyUnsigned(key.getW().getAffineX(), out, 1);
		copyUnsigned(key.getW().getAffineY(), out, 33);
		return out;
	}

	public static ECPublicKey decodePublicKey(byte[] point) {
		if (point.length != 65 || point[0] != 4) {
			throw new IllegalArgumentException("Expected an uncompressed P-256 public key (65 bytes)");
		}
		BigInteger x = new BigInteger(1, Arrays.copyOfRange(point, 1, 33));
		BigInteger y = new BigInteger(1, Arrays.copyOfRange(point, 33, 65));
		try {
			return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), p256()));
		} catch (GeneralSecurityException e) {
			throw new IllegalArgumentException("Not a valid P-256 public key", e);
		}
	}

	/** The private scalar d as 32 bytes. */
	public static byte[] encodePrivateKey(ECPrivateKey key) {
		byte[] out = new byte[32];
		copyUnsigned(key.getS(), out, 0);
		return out;
	}

	public static ECPrivateKey decodePrivateKey(byte[] d) {
		try {
			return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, d), p256()));
		} catch (GeneralSecurityException e) {
			throw new IllegalArgumentException("Not a valid P-256 private key", e);
		}
	}

	private static void copyUnsigned(BigInteger value, byte[] out, int offset) {
		byte[] bytes = value.toByteArray();
		int length = Math.min(bytes.length, 32);
		System.arraycopy(bytes, bytes.length - length, out, offset + 32 - length, length);
	}

	/**
	 * Encrypts a message for one subscription (RFC 8291): the request body to POST to its endpoint
	 * with {@code Content-Encoding: aes128gcm}.
	 *
	 * @param userAgentPublicKey the subscription's p256dh key (65 bytes)
	 * @param authSecret the subscription's auth secret (16 bytes)
	 */
	public static byte[] encrypt(byte[] plaintext, byte[] userAgentPublicKey, byte[] authSecret) {
		KeyPair ephemeral = newKeyPair();
		byte[] salt = new byte[16];
		RANDOM.nextBytes(salt);
		return encrypt(plaintext, userAgentPublicKey, authSecret, ephemeral, salt);
	}

	/** With a given ephemeral key pair and salt, for tests. */
	static byte[] encrypt(byte[] plaintext, byte[] userAgentPublicKey, byte[] authSecret, KeyPair ephemeral, byte[] salt) {
		try {
			byte[] serverPublic = encodePublicKey((ECPublicKey) ephemeral.getPublic());
			byte[] secret = ecdh((ECPrivateKey) ephemeral.getPrivate(), decodePublicKey(userAgentPublicKey));
			byte[][] keyAndNonce = contentKeys(secret, authSecret, userAgentPublicKey, serverPublic, salt);

			// One record: the message, then the padding delimiter 0x02 (last record), no padding.
			byte[] record = Arrays.copyOf(plaintext, plaintext.length + 1);
			record[plaintext.length] = 2;
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyAndNonce[0], "AES"), new GCMParameterSpec(128, keyAndNonce[1]));
			byte[] ciphertext = cipher.doFinal(record);
			if (ciphertext.length > RECORD_SIZE) {
				throw new IllegalArgumentException("Push message too long");
			}

			return ByteBuffer.allocate(16 + 4 + 1 + serverPublic.length + ciphertext.length)
					.put(salt).putInt(RECORD_SIZE).put((byte) serverPublic.length).put(serverPublic).put(ciphertext)
					.array();
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException("Could not encrypt the push message", e);
		}
	}

	/** The content encryption key (16 bytes) and nonce (12 bytes) of RFC 8291 section 3.4. */
	static byte[][] contentKeys(byte[] ecdhSecret, byte[] authSecret, byte[] userAgentPublic, byte[] serverPublic, byte[] salt)
			throws GeneralSecurityException {
		byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), userAgentPublic, serverPublic);
		byte[] ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
		byte[] cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
		byte[] nonce = hkdf(salt, ikm, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
		return new byte[][] { cek, nonce };
	}

	static byte[] ecdh(ECPrivateKey privateKey, ECPublicKey publicKey) throws GeneralSecurityException {
		KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
		agreement.init(privateKey);
		agreement.doPhase(publicKey, true);
		return agreement.generateSecret();
	}

	/** HKDF-SHA256 (RFC 5869) with a single expand block, enough for up to 32 bytes. */
	static byte[] hkdf(byte[] salt, byte[] ikm, byte[] info, int length) throws GeneralSecurityException {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(salt, "HmacSHA256"));
		byte[] prk = mac.doFinal(ikm);
		mac.init(new SecretKeySpec(prk, "HmacSHA256"));
		mac.update(info);
		mac.update((byte) 1);
		return Arrays.copyOf(mac.doFinal(), length);
	}

	private static byte[] concat(byte[]... parts) {
		int length = 0;
		for (byte[] part : parts) {
			length += part.length;
		}
		ByteBuffer buffer = ByteBuffer.allocate(length);
		for (byte[] part : parts) {
			buffer.put(part);
		}
		return buffer.array();
	}

	/**
	 * The VAPID {@code Authorization} header value for an endpoint: {@code vapid t=<JWT>, k=<public key>}.
	 * The JWT names the push service's origin as audience, expires after 12 hours and carries the contact.
	 */
	public static String vapidAuthorization(URI endpoint, String subject, ECPublicKey publicKey, ECPrivateKey privateKey, Instant now) {
		String audience = endpoint.getScheme() + "://" + endpoint.getHost() + (endpoint.getPort() == -1 ? "" : ":" + endpoint.getPort());
		String header = B64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
		String claims = B64.encodeToString(("{\"aud\":\"" + audience + "\",\"exp\":" + now.plusSeconds(12 * 3600).getEpochSecond()
				+ ",\"sub\":\"" + subject.replace("\"", "") + "\"}").getBytes(StandardCharsets.UTF_8));
		String unsigned = header + "." + claims;
		try {
			// P1363 format gives the raw r || s (64 bytes) that JWS ES256 wants, not DER.
			Signature signer = Signature.getInstance("SHA256withECDSAinP1363Format");
			signer.initSign(privateKey);
			signer.update(unsigned.getBytes(StandardCharsets.US_ASCII));
			String jwt = unsigned + "." + B64.encodeToString(signer.sign());
			return "vapid t=" + jwt + ", k=" + base64Url(encodePublicKey(publicKey));
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException("Could not sign the VAPID token", e);
		}
	}

}
