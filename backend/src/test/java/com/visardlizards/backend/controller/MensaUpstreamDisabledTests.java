package com.visardlizards.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "mensa.upstream.enabled=false")
class MensaUpstreamDisabledTests {

    @Autowired
    private ApplicationContext context;

    @Test
    void rawEndpointsAreDisabledByDefault() {
        assertTrue(context.getBeansOfType(MensaUpstreamController.class).isEmpty());
    }
}
