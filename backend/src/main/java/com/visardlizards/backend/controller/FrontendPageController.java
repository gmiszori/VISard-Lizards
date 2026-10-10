package com.visardlizards.backend.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Controller
public class FrontendPageController {

    @GetMapping("/")
    public String home() {
        return "forward:/index.html";
    }

    @GetMapping({"/settings", "/settings/"})
    public String settings() {
        return "forward:/settings/index.html";
    }

    @GetMapping({"/onboarding", "/onboarding/"})
    public String onboarding() {
        return "forward:/onboarding/index.html";
    }

    @GetMapping({"/canteen/{id}", "/canteen/{id}/"})
    public String canteen(@PathVariable String id) {
        return "forward:/canteen/" + id + "/index.html";
    }
}
