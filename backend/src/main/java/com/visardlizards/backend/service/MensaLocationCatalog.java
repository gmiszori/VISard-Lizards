package com.visardlizards.backend.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/** Bundled upstream identifiers, returned unchanged for the caller's own mapping. */
@Service
public class MensaLocationCatalog {

    private final String ethLocations = read("mensa/eth-locations.json");
    private final String uzhLocations = read("mensa/uzh-zfv-locations.json");

    public String readEthLocations() {
        return ethLocations;
    }

    public String readUzhZfvLocations() {
        return uzhLocations;
    }

    private static String read(String path) {
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException("Could not load upstream location catalog " + path, exception);
        }
    }
}
