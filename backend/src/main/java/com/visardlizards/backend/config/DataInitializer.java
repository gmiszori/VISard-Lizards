package com.visardlizards.backend.config;

import com.visardlizards.backend.service.DataService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataInitializer {

    @Bean
    public CommandLineRunner initData(DataService dataService) {
        return args -> {
            if (dataService.getAll().isEmpty()) {
                dataService.save("app-info", "{\"name\": \"VISard-Lizards\", \"version\": \"1.0.0\", \"hackathon\": \"VISCon\"}");
                dataService.save("welcome-message", "{\"title\": \"Welcome to VISard-Lizards Backend\", \"status\": \"ready\"}");
            }
        };
    }
}
