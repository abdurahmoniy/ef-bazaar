package uz.efbazaar.marketplace.popup;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.popup.PopupDtos.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PopupService {
    private final PopupRepository repository;

    @Transactional(readOnly = true)
    public List<Campaign> list() { return repository.list(); }

    @Transactional
    public Campaign create(UUID adminId, CreateCampaign input) {
        if (!input.endsAt().isAfter(input.startsAt())
                || Duration.between(input.startsAt(), input.endsAt()).compareTo(Duration.ofDays(30)) > 0) {
            throw invalid("Boshlanish va tugash oralig'i 30 kundan oshmasligi kerak");
        }
        boolean hasRecipients = input.recipientIds() != null && !input.recipientIds().isEmpty();
        if ((input.audience() == Audience.SELECTED) != hasRecipients) {
            throw invalid("Tanlangan auditoriya uchun foydalanuvchi IDlarini kiriting");
        }
        if ((input.actionLabel() == null) != (input.actionPath() == null)
                || (input.actionLabel() != null && (input.actionLabel().isBlank() || !PopupActionPath.allowed(input.actionPath())))) {
            throw invalid("Tugma matni va ruxsat etilgan ichki havolani birga kiriting");
        }
        return repository.insert(adminId, input);
    }

    @Transactional
    public Campaign updateStatus(UUID id, Status status) {
        if (status == Status.DRAFT) throw invalid("Faqat ACTIVE yoki PAUSED holatini tanlang");
        if (!repository.updateStatus(id, status)) {
            if (repository.find(id, false).isEmpty()) throw missing();
            throw invalid("Muddati tugagan xabarni e'lon qilib bo'lmaydi");
        }
        return repository.find(id, false).orElseThrow(PopupService::missing);
    }

    @Transactional(readOnly = true)
    public Optional<PublicCampaign> next(UUID userId, Trigger trigger) {
        return repository.next(userId, trigger).map(PublicCampaign::of);
    }

    @Transactional
    public Optional<Delivery> claim(UUID id, UUID userId, Claim input) {
        // Lock order: user, then campaign. The campaign share lock serializes claims with pause/publish.
        repository.lockUser(userId);
        Optional<Campaign> campaign = repository.find(id, true);
        if (campaign.isEmpty()) return Optional.empty();
        // Sample database time after waiting for locks, so a queued claim cannot reuse stale eligibility.
        Instant now = repository.now();
        if (!repository.eligible(id, userId, input.trigger(), input.sessionId(), now)) return Optional.empty();
        UUID deliveryId = repository.reserve(id, userId, input.sessionId(), now);
        return Optional.of(new Delivery(deliveryId, PublicCampaign.of(campaign.get())));
    }

    @Transactional
    public void recordEvent(UUID deliveryId, UUID userId, Event event) {
        if (!repository.recordEvent(deliveryId, userId, event)) throw missing();
    }

    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Xabar topilmadi"); }
}
