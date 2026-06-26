package uz.efbazaar.auth.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class HealthController {

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of(
                "service", "auth-service",
                "status", "UP",
                "timestamp", Instant.now().toString()
        );
    }
}
