package uz.efbazaar.trade.trade.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.AdminFeePayer;
import uz.efbazaar.trade.trade.domain.TradeMode;

import java.io.IOException;
import java.util.UUID;

/**
 * Sent by the proposer (either seller or buyer). Roles are decided at accept
 * time based on who owns the listing referenced by marketplaceChatId.
 *
 * <p>{@code cardId} is nullable: a HUMAN trade has no platform payment, so no
 * card is involved. SMART still requires both parties' cards, enforced in
 * {@code TradeService.openTrade}.
 *
 * <p>{@code mode}, {@code adminId} and {@code adminFeeUzs} may only be set by
 * the SELLER — see {@code TradeProposalService.create}.
 */
public record ProposalCreateRequest(
        @NotNull UUID marketplaceChatId,
        @NotNull UUID otherPartyUserId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        /**
         * Money the accepter pays: the price on a sale, the surcharge on a swap
         * that has one. Zero on a plain swap, which is why the floor is 0.
         */
        @NotNull @Min(0) @Max(9007199254740991L)
        @JsonDeserialize(using = WholeSomDeserializer.class) Long amountUzs,
        UUID cardId,
        UUID listingId,
        /** {@code null} is treated as {@link TradeMode#SMART}. */
        TradeMode mode,
        /** Required when {@code mode == HUMAN}. */
        UUID adminId,
        /** Required when {@code mode == HUMAN}; must sit inside the admin's band. */
        @Min(1) Long adminFeeUzs,
        /** {@code null} is treated as {@link TradeKind#SALE}. */
        TradeKind kind,
        AdminFeePayer adminFeePayer
) {
    public ProposalCreateRequest(UUID marketplaceChatId, UUID otherPartyUserId, UUID sellerId, UUID buyerId,
                                 Long amountUzs, UUID cardId, UUID listingId, TradeMode mode, UUID adminId,
                                 Long adminFeeUzs, TradeKind kind) {
        this(marketplaceChatId, otherPartyUserId, sellerId, buyerId, amountUzs, cardId, listingId,
                mode, adminId, adminFeeUzs, kind, null);
    }

    public AdminFeePayer payerOrDefault() {
        return kindOrDefault().isSwap() && adminFeePayer != null ? adminFeePayer : AdminFeePayer.SELLER;
    }

    @JsonIgnore
    @AssertTrue(message = "Sotuv va doplata miqdori kamida 5 000 so‘m, oddiy obmen miqdori 0 bo‘lishi kerak")
    public boolean isAmountValid() {
        return amountUzs == null || (kindOrDefault() == TradeKind.SWAP ? amountUzs == 0 : amountUzs >= 5000);
    }

    /** Jackson otherwise silently truncates fractional JSON numbers into Long. */
    public static class WholeSomDeserializer extends JsonDeserializer<Long> {
        @Override
        public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                return context.reportInputMismatch(Long.class, "Miqdor butun son bo‘lishi kerak");
            }
            return parser.getLongValue();
        }
    }

    public TradeKind kindOrDefault() {
        return kind == null ? TradeKind.SALE : kind;
    }

    public TradeMode modeOrDefault() {
        return mode == null ? TradeMode.SMART : mode;
    }
}
