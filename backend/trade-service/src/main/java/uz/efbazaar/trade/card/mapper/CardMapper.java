package uz.efbazaar.trade.card.mapper;

import org.mapstruct.Mapper;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.dto.CardResponse;

@Mapper(componentModel = "spring")
public interface CardMapper {
    CardResponse toResponse(Card card);
}
