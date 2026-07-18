package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
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
        String emailChangeVerificationCode
) {}

