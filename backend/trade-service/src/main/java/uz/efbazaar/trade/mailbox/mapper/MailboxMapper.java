package uz.efbazaar.trade.mailbox.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.dto.AdminMailboxResponse;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;

@Mapper(componentModel = "spring")
public interface MailboxMapper {
    @Mapping(target = "locked", ignore = true)
    MailboxResponse toResponse(Mailbox mailbox);

    AdminMailboxResponse toAdminResponse(Mailbox mailbox);
}
