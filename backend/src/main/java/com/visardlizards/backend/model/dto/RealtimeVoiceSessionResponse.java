package com.visardlizards.backend.model.dto;

public record RealtimeVoiceSessionResponse(String clientSecret, long expiresAt, String instructions) { }
