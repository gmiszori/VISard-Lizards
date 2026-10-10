package com.visardlizards.backend.service.push;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The server's VAPID key pair, which browsers bind each push subscription to. Taken from
 * {@code app.push.vapid-public-key} / {@code app.push.vapid-private-key} (env VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY), else from {@code app.push.key-file}, which is created with a new pair on first start.
 * A new pair invalidates every existing subscription, so the file must survive restarts (like the database).
 */
@Component
public class VapidKeys {

	private static final Logger log = LoggerFactory.getLogger(VapidKeys.class);

	private final ECPublicKey publicKey;
	private final ECPrivateKey privateKey;

	public VapidKeys(@Value("${app.push.vapid-public-key:}") String configuredPublic,
			@Value("${app.push.vapid-private-key:}") String configuredPrivate,
			@Value("${app.push.key-file:./data/vapid-keys.properties}") String keyFile) {
		String publicValue = configuredPublic;
		String privateValue = configuredPrivate;
		if (publicValue.isBlank() || privateValue.isBlank()) {
			Properties stored = loadOrCreate(Path.of(keyFile));
			publicValue = stored.getProperty("public");
			privateValue = stored.getProperty("private");
		}
		this.publicKey = WebPushCrypto.decodePublicKey(WebPushCrypto.fromBase64Url(publicValue));
		this.privateKey = WebPushCrypto.decodePrivateKey(WebPushCrypto.fromBase64Url(privateValue));
	}

	private static Properties loadOrCreate(Path file) {
		Properties properties = new Properties();
		try {
			if (Files.exists(file)) {
				try (Reader reader = Files.newBufferedReader(file)) {
					properties.load(reader);
				}
				if (properties.getProperty("public") != null && properties.getProperty("private") != null) {
					return properties;
				}
			}
			KeyPair pair = WebPushCrypto.newKeyPair();
			properties.setProperty("public", WebPushCrypto.base64Url(WebPushCrypto.encodePublicKey((ECPublicKey) pair.getPublic())));
			properties.setProperty("private", WebPushCrypto.base64Url(WebPushCrypto.encodePrivateKey((ECPrivateKey) pair.getPrivate())));
			if (file.getParent() != null) {
				Files.createDirectories(file.getParent());
			}
			try (Writer writer = Files.newBufferedWriter(file)) {
				properties.store(writer, "VAPID keys for Web Push. Keep private; a new pair invalidates all subscriptions.");
			}
			log.info("Created new VAPID keys in {}", file.toAbsolutePath());
			return properties;
		} catch (IOException e) {
			throw new IllegalStateException("Could not read or write the VAPID key file " + file, e);
		}
	}

	public ECPublicKey publicKey() {
		return publicKey;
	}

	public ECPrivateKey privateKey() {
		return privateKey;
	}

	/** The applicationServerKey for PushManager.subscribe: base64url of the uncompressed point. */
	public String publicKeyBase64Url() {
		return WebPushCrypto.base64Url(WebPushCrypto.encodePublicKey(publicKey));
	}

}
