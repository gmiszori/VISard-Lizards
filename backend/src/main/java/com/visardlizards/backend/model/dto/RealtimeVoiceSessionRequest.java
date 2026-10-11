package com.visardlizards.backend.model.dto;

import org.jspecify.annotations.Nullable;

import com.visardlizards.backend.model.domain.PriceCategory;

public record RealtimeVoiceSessionRequest(@Nullable String activeMensaId,
        @Nullable String activeCampusId, @Nullable PriceCategory priceCategory, @Nullable String appLanguage) {
    public RealtimeVoiceSessionRequest(String activeMensaId, String activeCampusId, PriceCategory priceCategory) {
        this(activeMensaId, activeCampusId, priceCategory, null);
    }
}
