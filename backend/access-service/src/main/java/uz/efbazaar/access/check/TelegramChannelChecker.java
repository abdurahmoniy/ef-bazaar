package uz.efbazaar.access.check;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.access.bot.BotClient;
import uz.efbazaar.access.bot.BotClient.BotUnavailableException;
import uz.efbazaar.access.bot.BotClient.MemberStatus;
import uz.efbazaar.access.requirement.AccessRequirement;
import uz.efbazaar.access.requirement.RequirementType;
import uz.efbazaar.access.requirement.TelegramChannelConfig;

import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramChannelChecker implements RequirementChecker {

    private static final Set<String> MEMBER_STATUSES = Set.of("creator", "administrator", "member");
    private static final Set<String> NOT_MEMBER_STATUSES = Set.of("left", "kicked");

    private final BotClient bot;

    @Override
    public RequirementType type() {
        return RequirementType.TELEGRAM_CHANNEL;
    }

    @Override
    public CheckOutcome check(AccessRequirement requirement, long telegramId) {
        TelegramChannelConfig channel = requirement.telegramChannel();
        MemberStatus status;
        try {
            status = bot.memberStatus(channel.chatId(), telegramId);
        } catch (BotUnavailableException e) {
            log.warn("Kanal a'zoligi tekshirilmadi (chatId={}): {}", channel.chatId(), e.getMessage());
            return CheckOutcome.UNKNOWN;
        }

        if (MEMBER_STATUSES.contains(status.status())) return CheckOutcome.MET;
        // restricted — cheklangan, lekin a'zo bo'lishi ham mumkin; Telegram
        // buni alohida is_member bayrog'ida aytadi.
        if ("restricted".equals(status.status())) {
            return status.member() ? CheckOutcome.MET : CheckOutcome.UNMET;
        }
        if (NOT_MEMBER_STATUSES.contains(status.status())) return CheckOutcome.UNMET;

        log.warn("Kanal a'zoligi: noma'lum maqom '{}' (chatId={})", status.status(), channel.chatId());
        return CheckOutcome.UNKNOWN;
    }
}
