package uz.efbazaar.access.requirement;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.access.bot.BotClient;
import uz.efbazaar.access.bot.BotClient.BotUnavailableException;
import uz.efbazaar.access.bot.BotClient.ChannelInfo;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AccessRequirementService {

    /**
     * Telegram ommaviy username qoidasi: 5–32 belgi, harf/raqam/pastki chiziq.
     * Admin {@code @name}, {@code name} yoki {@code t.me/name} havolasini
     * qo'yishi mumkin — uchalasi ham qabul qilinadi.
     */
    private static final Pattern USERNAME = Pattern.compile(
            "^(?:https?://)?(?:t\\.me/|telegram\\.me/|@)?([A-Za-z0-9_]{5,32})/?$");

    /** Bot a'zolarni faqat shu maqomlarda ko'ra oladi. */
    private static final Set<String> BOT_ADMIN_STATUSES = Set.of("administrator", "creator");

    private final AccessRequirementRepository repository;
    private final BotClient bot;

    @Transactional(readOnly = true)
    public List<RequirementView> list() {
        return repository.findAllByOrderByPositionAscCreatedAtAsc().stream()
                .map(RequirementView::of)
                .toList();
    }

    @Transactional
    public RequirementView addTelegramChannel(String rawUsername, UUID adminId) {
        String username = normalizeUsername(rawUsername);

        ChannelInfo channel;
        try {
            channel = bot.resolveChannel(username)
                    .orElseThrow(AccessRequirementException::channelNotFound);
        } catch (BotUnavailableException e) {
            log.warn("Kanal @{} tekshirilmadi — bot javob bermadi: {}", username, e.getMessage());
            throw AccessRequirementException.botUnavailable();
        }

        if (!"channel".equals(channel.type())) {
            throw AccessRequirementException.notAChannel();
        }
        // Bot admin bo'lmasa getChatMember a'zolarni ko'rsatmaydi — shart
        // hech qachon tekshirilmas va hamma o'tib ketardi. Shuning uchun
        // bu holatda ulashning o'zi rad etiladi.
        if (channel.botStatus() == null || !BOT_ADMIN_STATUSES.contains(channel.botStatus())) {
            throw AccessRequirementException.botNotChannelAdmin();
        }

        String externalKey = String.valueOf(channel.chatId());
        if (repository.existsByTypeAndExternalKey(RequirementType.TELEGRAM_CHANNEL, externalKey)) {
            throw AccessRequirementException.alreadyAdded();
        }

        var config = new TelegramChannelConfig(
                channel.chatId(),
                channel.username() != null ? channel.username() : username,
                channel.title(),
                channel.photoFileId());

        AccessRequirement requirement = AccessRequirement.builder()
                .type(RequirementType.TELEGRAM_CHANNEL)
                .externalKey(externalKey)
                .config(config.toMap())
                .position(repository.maxPosition() + 1)
                .createdBy(adminId)
                .build();
        try {
            requirement = repository.saveAndFlush(requirement);
        } catch (DataIntegrityViolationException e) {
            // Ikki admin bir vaqtda bir kanalni qo'shdi.
            throw AccessRequirementException.alreadyAdded();
        }

        log.info("Kirish sharti qo'shildi: kanal @{} (chatId={}) admin={}",
                config.username(), config.chatId(), adminId);
        return RequirementView.of(requirement);
    }

    @Transactional
    public void delete(UUID id, UUID adminId) {
        AccessRequirement requirement = repository.findById(id)
                .orElseThrow(AccessRequirementException::notFound);
        repository.delete(requirement);
        log.info("Kirish sharti olib tashlandi: id={} type={} key={} admin={}",
                id, requirement.getType(), requirement.getExternalKey(), adminId);
    }

    static String normalizeUsername(String raw) {
        if (raw == null) throw AccessRequirementException.invalidUsername();
        Matcher matcher = USERNAME.matcher(raw.trim());
        if (!matcher.matches()) throw AccessRequirementException.invalidUsername();
        return matcher.group(1);
    }
}
