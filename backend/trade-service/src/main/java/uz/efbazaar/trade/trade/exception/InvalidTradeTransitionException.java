package uz.efbazaar.trade.trade.exception;

import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;

public class InvalidTradeTransitionException extends RuntimeException {
    public InvalidTradeTransitionException(TradeState state, TradeEvent event) {
        super("Illegal event " + event + " from state " + state);
    }
}
