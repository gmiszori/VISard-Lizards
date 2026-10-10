package com.visardlizards.backend.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.model.dto.RealtimeVoiceSessionRequest;
import com.visardlizards.backend.model.dto.RealtimeVoiceSessionResponse;
import com.visardlizards.backend.service.OpenAiRealtimeSessionService;

@RestController
public class RealtimeVoiceController {
    private final OpenAiRealtimeSessionService sessions;

    public RealtimeVoiceController(OpenAiRealtimeSessionService sessions) {
        this.sessions = sessions;
    }

    @PostMapping("/api/voice/realtime-session")
    public RealtimeVoiceSessionResponse createSession(@RequestBody RealtimeVoiceSessionRequest request) {
        return sessions.create(request);
    }
}
