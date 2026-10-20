package uz.efbazaar.trade.mailbox.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.dto.AdminMailboxResponse;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;

@Mapper(componentModel = "spring")
public interface MailboxMapper {
    @Mapping(target = "accessState", ignore = true)
    @Mapping(target = "paidExpiresAt", ignore = true)
    @Mapping(target = "graceEndsAt", ignore = true)
    @Mapping(target = "selectedForFree", ignore = true)
    @Mapping(target = "locked", ignore = true)
    @Mapping(target = "activeSessionId", ignore = true)
    @Mapping(target = "activeTrade", ignore = true)
    @Mapping(target = "slotExempt", expression = "java(mailbox.getSource() == uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN)")
    MailboxResponse toResponse(Mailbox mailbox);

    AdminMailboxResponse toAdminResponse(Mailbox mailbox);
}
