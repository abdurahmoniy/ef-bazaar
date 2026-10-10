package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.account.dto.UserAccountCreateRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountUpdateRequest;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.service.MediaService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserAccountService {

    /** "Akkountlarim" tarixida qoladigan arxiv sabablari. */
    static final Set<ArchivedReason> HISTORY_REASONS = Set.of(
            ArchivedReason.SOLD_ON_PLATFORM, ArchivedReason.SOLD_ELSEWHERE,
            ArchivedReason.SWAPPED_ON_PLATFORM);

    /** Atributlar ichidagi o'yinchilar ro'yxatining kaliti — e'lon bilan bir xil. */
    private static final String SQUAD_KEY = "valuable_players";

    private final UserAccountRepository accounts;
    private final UserAccountCardInventory inventory;
    private final UserAccountPublisher publisher;
    private final MediaService media;
    private final uz.efbazaar.marketplace.service.ListingCaptionBuilder captions;

    @Transactional(readOnly = true)
    public List<UserAccount> list(UUID ownerId) {
        // Faollar oldin, keyin tarix — sotilgan va obmen qilinganlar, eng yangisi tepada.
        List<UserAccount> all = new ArrayList<>(
                accounts.findByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, UserAccountStatus.ACTIVE));
        all.addAll(accounts.findByOwnerIdAndStatusAndArchivedReasonInOrderByArchivedAtDescCreatedAtDesc(
                ownerId, UserAccountStatus.ARCHIVED, HISTORY_REASONS));
        return all;
    }

    @Transactional(readOnly = true)
    public UserAccount get(UUID id, UUID ownerId) {
        return accounts.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(MarketplaceException::accountNotFound);
    }

    /**
     * O'zgartirish uchun: sotilgan akkount egasining tarixida faqat o'qish
     * uchun turadi. Uning ma'lumoti endi xaridorniki — tahrir, email yoki
     * o'chirish tarixni buzardi.
     */
    private UserAccount editable(UUID id, UUID ownerId) {
        UserAccount account = get(id, ownerId);
        if (account.getStatus() == UserAccountStatus.ARCHIVED) {
            throw MarketplaceException.accountArchived();
        }
        return account;
    }

    @Transactional
    public UserAccount create(UUID ownerId, UserAccountCreateRequest request) {
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(ownerId)
                .title(request.title())
                .description(request.description())
                .attributes(request.attributes() == null
                        ? new HashMap<>() : new HashMap<>(request.attributes()))
                .mediaMessageIds(request.mediaMessageIds() == null
                        ? new ArrayList<>() : new ArrayList<>(request.mediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .build();

        UserAccount saved = accounts.saveAndFlush(account);
        inventory.replace(saved.getId(), saved.getAttributes().get(SQUAD_KEY));
        log.info("Account created: id={} ownerId={}", saved.getId(), ownerId);
        return saved;
    }

    @Transactional
    public UserAccount update(UUID id, UUID ownerId, UserAccountUpdateRequest request) {
        UserAccount account = editable(id, ownerId);
        if (request.title() != null) {
            account.setTitle(request.title());
        }
        if (request.description() != null) {
            account.setDescription(request.description());
        }
        if (request.attributes() != null) {
            account.setAttributes(new HashMap<>(request.attributes()));
        }
        if (request.mediaMessageIds() != null) {
            account.setMediaMessageIds(new ArrayList<>(request.mediaMessageIds()));
        }

        UserAccount saved = accounts.saveAndFlush(account);
        inventory.replace(saved.getId(), saved.getAttributes().get(SQUAD_KEY));
        // Akkount yagona manba: bozorda tursa e'lon ham shu zahoti yangilanadi.
        publisher.propagate(saved);
        return saved;
    }

    /**
     * Rasmlarni almashtiradi.
     *
     * <p>Yuklash Telegram'ga ketadi va JPA tranzaksiyasidan TASHQARIDA
     * bo'ladi — sekin Telegram javobi baza qulfini ushlab turmasligi kerak
     * ({@code ListingService.create} bilan bir xil qoida).
     */
    public UserAccount replaceMedia(UUID id, UUID ownerId, List<MultipartFile> files) {
        UserAccount account = editable(id, ownerId);
        media.validate(files);
        // E'lon bilan bir xil izoh: division, team strength, kartalar,
        // coinlar, tavsif. Ilgari bu yerga faqat akkount nomi ketardi va
        // admin media topigida rasmlardan boshqa hech narsa ko'rmasdi.
        String caption = captions.build(account);

        // Yuklash ATAYLAB tranzaksiyadan tashqarida. Metodda @Transactional
        // yo'q: saveAndFlush o'zining qisqa tranzaksiyasini ochadi va sekin
        // Telegram javobi baza qulfini ushlab turmaydi.
        //
        // Bog'lanish AKKOUNTGA yoziladi: e'lon vaqtinchalik (sotiladi,
        // o'chiriladi, qayta ochiladi), akkount esa doimiy va rasmlar u
        // bilan qoladi.
        List<String> uploaded = media.uploadToBotForAccount(files, caption, account.getId());

        account.setMediaMessageIds(new ArrayList<>(uploaded));
        UserAccount saved = accounts.saveAndFlush(account);
        publisher.propagate(saved);
        log.info("Account media replaced: id={} media={}", id, uploaded.size());
        return saved;
    }

    @Transactional
    public UserAccount setEmail(UUID id, UUID ownerId, String email) {
        UserAccount account = editable(id, ownerId);
        String trimmed = email == null || email.isBlank() ? null : email.trim();
        account.setEmail(trimmed);
        // Qo'lda kiritilgan manzil platforma pochtasining o'rnini bosadi: eski
        // mailbox havolasi qolsa, u endi boshqa qutini ko'rsatib turardi.
        account.setEmailSource(trimmed == null ? null : EmailSource.MANUAL);
        account.setMailboxId(null);
        return accounts.saveAndFlush(account);
    }

    @Transactional
    public void delete(UUID id, UUID ownerId) {
        UserAccount account = editable(id, ownerId);
        if (account.isOnMarket()) {
            throw MarketplaceException.accountOnMarket();
        }
        accounts.delete(account);
        log.info("Account deleted: id={} ownerId={}", id, ownerId);
    }
}
