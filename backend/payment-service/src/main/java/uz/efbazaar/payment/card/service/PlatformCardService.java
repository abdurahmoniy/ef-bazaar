package uz.efbazaar.payment.card.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.CardAuditAction;
import uz.efbazaar.payment.card.domain.CardBrand;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.domain.PlatformCardAudit;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.crypto.EncryptedField;
import uz.efbazaar.payment.crypto.PaymentCrypto;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PlatformCardService {

    private final PlatformCardRepository cards;
    private final PlatformCardAuditRepository audits;
    private final PaymentCrypto crypto;

    @Transactional
    public PlatformCard create(UUID actorId, PlatformCardCreateRequest req) {
        String pan = req.pan().replaceAll("\\D", "");
        // LuhnValidator is a final class with a static method — call it
        // statically, do not try to inject it as a bean.
        if (pan.length() < 12 || !LuhnValidator.isValid(pan)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Karta raqami noto'g'ri");
        }
        String last4 = pan.substring(pan.length() - 4);
        if (cards.existsByLast4AndActiveTrue(last4)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Oxirgi 4 raqami bir xil faol karta allaqachon bor: " + last4);
        }

        UUID id = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("pcard-" + id, pan.getBytes(StandardCharsets.UTF_8));

        int nextOrder = cards.findByActiveTrueOrderByDisplayOrderAsc().stream()
                .mapToInt(PlatformCard::getDisplayOrder)
                .max().orElse(0) + 1;

        PlatformCard card = PlatformCard.builder()
                .id(id)
                .panEncrypted(enc.ciphertext())
                .panIv(enc.iv())
                .panTag(enc.tag())
                .last4(last4)
                .holderName(req.holderName().trim().toUpperCase())
                .expiryMonth(req.expiryMonth())
                .expiryYear(req.expiryYear())
                .brand(CardBrand.detect(pan))
                .displayOrder(nextOrder)
                .active(true)
                .createdAt(Instant.now())
                .createdBy(actorId)
                .build();

        try {
            cards.saveAndFlush(card);
        } catch (DataIntegrityViolationException e) {
            // Lost a race against a concurrent create for the same last4 or order.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Karta qo'shilmadi — qayta urinib ko'ring", e);
        }
        audit(id, CardAuditAction.CREATED, actorId);
        return card;
    }

    @Transactional
    public void deactivate(UUID actorId, UUID cardId) {
        PlatformCard card = require(cardId);
        card.setActive(false);
        cards.save(card);
        audit(cardId, CardAuditAction.DEACTIVATED, actorId);
    }

    @Transactional
    public void activate(UUID actorId, UUID cardId) {
        PlatformCard card = require(cardId);
        // Unlike create(), a losing race here has no local try/catch: a
        // DataIntegrityViolationException from the save() below propagates
        // uncaught and is turned into 409 by the global PaymentExceptionHandler.
        // That's intentional, not an oversight -- see its doc comment.
        if (cards.existsByLast4AndActiveTrue(card.getLast4())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Oxirgi 4 raqami bir xil faol karta bor: " + card.getLast4());
        }
        card.setActive(true);
        card.setDisplayOrder(cards.findByActiveTrueOrderByDisplayOrderAsc().stream()
                .mapToInt(PlatformCard::getDisplayOrder)
                .max().orElse(0) + 1);
        cards.save(card);
        audit(cardId, CardAuditAction.ACTIVATED, actorId);
    }

    /**
     * Rewrites display_order to match the given sequence. Written in two passes
     * with an offset because uk_platform_cards_order_active is unique: assigning
     * 1,2 directly over an existing 1,2 collides mid-update.
     */
    @Transactional
    public void reorder(UUID actorId, List<UUID> orderedIds) {
        List<PlatformCard> active = cards.findByActiveTrueOrderByDisplayOrderAsc();
        if (orderedIds.size() != active.size()
                || !orderedIds.containsAll(active.stream().map(PlatformCard::getId).toList())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tartib ro'yxati barcha faol kartalarni o'z ichiga olishi kerak");
        }

        int offset = 1000;
        for (PlatformCard c : active) {
            c.setDisplayOrder(c.getDisplayOrder() + offset);
        }
        cards.saveAllAndFlush(active);

        for (int i = 0; i < orderedIds.size(); i++) {
            PlatformCard c = require(orderedIds.get(i));
            c.setDisplayOrder(i + 1);
            cards.save(c);
        }
        cards.flush();
        orderedIds.forEach(id -> audit(id, CardAuditAction.REORDERED, actorId));
    }

    @Transactional(readOnly = true)
    public List<PlatformCard> activeOrdered() {
        return cards.findByActiveTrueOrderByDisplayOrderAsc();
    }

    @Transactional(readOnly = true)
    public List<PlatformCard> listAll() {
        return cards.findAllByOrderByDisplayOrderAsc();
    }

    @Transactional(readOnly = true)
    public Optional<PlatformCard> findActiveByLast4(String last4) {
        return cards.findByLast4AndActiveTrue(last4);
    }

    @Transactional
    public void recordBalance(UUID cardId, long balanceTiyin, Instant observedAt) {
        PlatformCard card = require(cardId);
        card.setBalanceTiyin(balanceTiyin);
        card.setBalanceObservedAt(observedAt);
        cards.save(card);
    }

    /** Decrypts the PAN. Called when building the invoice a user must pay. */
    @Transactional(readOnly = true)
    public String revealPan(PlatformCard card) {
        byte[] plain = crypto.decrypt("pcard-" + card.getId(),
                new EncryptedField(card.getPanIv(), card.getPanTag(), card.getPanEncrypted()));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private PlatformCard require(UUID cardId) {
        return cards.findById(cardId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Karta topilmadi"));
    }

    private void audit(UUID cardId, CardAuditAction action, UUID actorId) {
        audits.save(PlatformCardAudit.builder()
                .cardId(cardId)
                .action(action)
                .actorId(actorId)
                .createdAt(Instant.now())
                .build());
    }
}
