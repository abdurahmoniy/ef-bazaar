package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record TradeResponse(
        UUID id,
        TradeState state,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        UUID mailboxId,
        /** Escrow mailbox address — seller needs it to change the Konami email. */
        String mailboxEmail,
        UUID chatId,
        Instant createdAt,
        Instant expiresAt,
        Instant stateDeadline,
        ParticipantRole role, // set by the controller based on the caller
        /** Set once WAITING_BUYER_VERIFY is reached so the buyer knows which message to reveal. */
        UUID passwordMessageId,
        /** Konami email-change verification code (6 digits). Populated by
         * KonamiEmailChangeCodeConsumer during WAITING_EMAIL_CHANGE. */
        String emailChangeVerificationCode,
        /** SALE, SWAP or SWAP_SURCHARGE — decides what the panel asks for. */
        TradeKind kind,
        /**
         * Both parties' progress, so each can see where the other has got to.
         * On a sale the buyer's entry stays empty: they are asked for none of
         * those steps.
         */
        List<TradeSideResponse> sides,
        /**
         * The address of the account this viewer is RECEIVING. Equals
         * {@code mailboxEmail} on a sale, where one box changes hands; on a
         * swap it is the other party's, because the boxes cross over.
         */
        String counterpartMailboxEmail,
        /**
         * Konami kirish kodi — FAQAT shu ko'ruvchi uchun. Akkountga kirishda
         * Konami uni pochtaga yuboradi, pochta esa hali platformada.
         */
        String loginVerificationCode,
        /**
         * Kirish kodisiz "Tasdiqlash" qachondan ochiladi.
         *
         * <p>Kod kelgan bo'lsa null — tugma allaqachon ochiq. 2FA so'ralmagan
         * akkountlarda odam qamalib qolmasligi uchun shu muddat bor.
         */
        Instant confirmUnlocksAt
) {}

