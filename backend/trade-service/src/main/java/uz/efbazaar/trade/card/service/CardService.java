package uz.efbazaar.trade.card.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CardService {

    private final CardRepository cards;
    private final TradeCrypto crypto;

    @Transactional
    public Card create(UUID ownerUserId, CardCreateRequest req) {
        String pan = req.pan();
        if (!LuhnValidator.isValid(pan)) {
            throw new CardValidationException("PAN failed Luhn check");
        }

        UUID cardId = UUID.randomUUID();
        String panContext = "card-pan-" + cardId;
        EncryptedField encPan = crypto.encrypt(panContext, pan.getBytes(StandardCharsets.UTF_8));

        Card card = Card.builder()
                .id(cardId)
                .ownerUserId(ownerUserId)
                .encryptedPan(encPan.ciphertext())
                .panIv(encPan.iv())
                .panTag(encPan.tag())
                .last4(pan.substring(pan.length() - 4))
                .expiryMonth(req.expiryMonth())
                .expiryYear(req.expiryYear())
                .brand(req.brand())
                .savedToProfile(req.saveToProfile())
                .build();

        if (req.brand() == CardBrand.VISA && req.cvv() != null && !req.cvv().isBlank()) {
            String cvvContext = "card-cvv-" + cardId;
            EncryptedField encCvv = crypto.encrypt(cvvContext,
                    req.cvv().getBytes(StandardCharsets.UTF_8));
            card.setEncryptedCvv(encCvv.ciphertext());
            card.setCvvIv(encCvv.iv());
            card.setCvvTag(encCvv.tag());
        }

        Card saved = cards.save(card);
        log.info("Saved card {} last4={} for user {}", saved.getId(), saved.getLast4(), ownerUserId);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<Card> listSaved(UUID ownerUserId) {
        return cards.findByOwnerUserIdAndSavedToProfileIsTrue(ownerUserId);
    }

    @Transactional
    public void delete(UUID ownerUserId, UUID cardId) {
        Card card = cards.findByIdAndOwnerUserId(cardId, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Card " + cardId + " not found for user " + ownerUserId));
        cards.delete(card);
    }
}
