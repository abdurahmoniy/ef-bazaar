package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.time.Instant;

/** One checklist row as the admin workspace and both party panels see it. */
public record TradeStepResponse(
        TradeStep step,
        String labelUz,
        boolean completed,
        Instant completedAt,
        String note
) {
    public static TradeStepResponse of(TradeStepMark m) {
        return new TradeStepResponse(
                m.getStep(),
                m.getStep().labelUz(),
                m.isComplete(),
                m.getCompletedAt(),
                m.getNote());
    }
}
