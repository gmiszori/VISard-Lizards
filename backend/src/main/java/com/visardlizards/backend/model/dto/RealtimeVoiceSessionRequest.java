package com.visardlizards.backend.model.dto;

import java.time.LocalDateTime;

import org.jspecify.annotations.Nullable;

import com.visardlizards.backend.model.domain.PriceCategory;

/** {@code now} is the app's (possibly simulated) Zurich local time, so the assistant shares the app's "today". */
public record RealtimeVoiceSessionRequest(@Nullable String activeMensaId,
        @Nullable String activeCampusId, @Nullable PriceCategory priceCategory, @Nullable String appLanguage,
        @Nullable LocalDateTime now) {
    public RealtimeVoiceSessionRequest(String activeMensaId, String activeCampusId, PriceCategory priceCategory) {
        this(activeMensaId, activeCampusId, priceCategory, null, null);
    }

    public RealtimeVoiceSessionRequest(String activeMensaId, String activeCampusId, PriceCategory priceCategory,
            String appLanguage) {
        this(activeMensaId, activeCampusId, priceCategory, appLanguage, null);
    }
}
