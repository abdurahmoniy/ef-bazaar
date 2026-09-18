package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * E'lon oqimi akkount modelini bilmasligi uchun qo'yilgan ilgak.
 *
 * <p>Ikki hodisa: e'lon yaratildi (ortida akkount ochiladi) va egasi uni
 * "sotildi" deb belgiladi (akkount arxivga tushadi). Ikkinchisi
 * platformadan TASHQARIDA sotilgan degani — savdo orqali sotilish
 * 2-bosqichda, trade-service hodisasi bilan keladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ListingAccountLink {

    private static final String SQUAD_KEY = "valuable_players";

    /** Sotuv sharti e'lonniki: akkount uni saqlab qolsa, keyingi chiqarishda eskisi qaytib kelardi. */
    private static final Set<String> LISTING_ONLY_ATTRIBUTES = Set.of("exchange_mode");

    private final UserAccountRepository accounts;
    private final UserAccountCardInventory inventory;
    private final ListingRepository listings;
    private final PendingAccountEmailRepository pendingEmails;

    @Transactional
    public void onListingCreated(Listing listing) {
        // Takror hodisa yoki backfill bir xil e'lon uchun ikkinchi akkount
        // ochmasligi kerak — qisman unique indeks ham shuni qo'llab turadi.
        if (accounts.existsBySourceListingId(listing.getId())) {
            log.debug("Account already exists for listing {}", listing.getId());
            return;
        }

        Map<String, Object> attributes = listing.getAttributes() == null
                ? new HashMap<>() : new HashMap<>(listing.getAttributes());
        LISTING_ONLY_ATTRIBUTES.forEach(attributes::remove);

        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(listing.getSellerId())
                .description(listing.getDescription())
                .attributes(attributes)
                .mediaMessageIds(listing.getMediaMessageIds() == null
                        ? new ArrayList<>() : new ArrayList<>(listing.getMediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .currentListingId(listing.getId())
                .sourceListingId(listing.getId())
                .build();

        UserAccount saved = accounts.saveAndFlush(account);
        inventory.replace(saved.getId(), listing.getAttributes() == null
                ? null : listing.getAttributes().get(SQUAD_KEY));
        log.info("Account created behind listing: accountId={} listingId={}",
                saved.getId(), listing.getId());
    }

    /**
     * Savdo platformada yakunlandi: akkount sotuvchidan xaridorga o'tadi.
     *
     * <p>Sotuvchida arxivga tushadi, xaridorda esa e'lon nusxasidan yangi
     * kartochka ochiladi — bir xil ma'lumot, lekin endi boshqa odamniki.
     * E'lon o'zi SOLD bo'lib qoladi va xaridorning akkounti bozorda emas.
     *
     * <p>Qayta yetkazilishi zararsiz: xaridorda shu savdo uchun akkount
     * allaqachon bo'lsa, hech narsa qilinmaydi.
     */
    @Transactional
    public void onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId) {
        // Obmenda sotuvchi ham akkount oladi — lekin uning ortida e'lon yo'q,
        // shuning uchun faqat pochtasi bo'lgan bo'sh kartochka ochiladi.
        // Busiz o'sha manzil kutish jadvalida abadiy qolib ketardi.
        openAccountForWaitingEmail(tradeId, sellerId);

        if (listingId == null || buyerId == null || tradeId == null) {
            log.debug("trade-succeeded without ids, skipping account handover");
            return;
        }
        if (accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId).isPresent()) {
            log.debug("Account for trade {} already moved to {}", tradeId, buyerId);
            return;
        }

        accounts.findByCurrentListingId(listingId).ifPresent(sellerAccount -> {
            sellerAccount.setStatus(UserAccountStatus.ARCHIVED);
            sellerAccount.setArchivedReason(ArchivedReason.SOLD_ON_PLATFORM);
            // Pochta xaridorga o'tdi: sotuvchining ro'yxatida turishi chalg'itardi.
            sellerAccount.setEmail(null);
            sellerAccount.setEmailSource(null);
            sellerAccount.setMailboxId(null);
            sellerAccount.setCurrentListingId(null);
            accounts.saveAndFlush(sellerAccount);
            log.info("Seller account archived after trade: accountId={} tradeId={}",
                    sellerAccount.getId(), tradeId);
        });

        Listing listing = listings.findById(listingId).orElse(null);
        if (listing == null) {
            log.warn("Listing {} is gone — buyer {} gets no account from trade {}",
                    listingId, buyerId, tradeId);
            return;
        }

        Map<String, Object> attributes = listing.getAttributes() == null
                ? new HashMap<>() : new HashMap<>(listing.getAttributes());
        LISTING_ONLY_ATTRIBUTES.forEach(attributes::remove);

        UserAccount buyerAccount = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(buyerId)
                .title(listing.getDescription() == null ? null : shortTitle(listing.getDescription()))
                .description(listing.getDescription())
                .attributes(attributes)
                .mediaMessageIds(listing.getMediaMessageIds() == null
                        ? new ArrayList<>() : new ArrayList<>(listing.getMediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .sourceTradeId(tradeId)
                .build();

        // Pochta hodisasi oldinroq kelgan bo'lsa, manzil kutib turibdi.
        pendingEmails.findByTradeIdAndUserId(tradeId, buyerId).ifPresent(pending -> {
            buyerAccount.setEmail(pending.getEmail());
            buyerAccount.setEmailSource(EmailSource.PLATFORM);
            pendingEmails.delete(pending);
        });

        UserAccount saved = accounts.saveAndFlush(buyerAccount);
        inventory.replace(saved.getId(), listing.getAttributes() == null
                ? null : listing.getAttributes().get(SQUAD_KEY));
        log.info("Buyer account opened from trade: accountId={} buyerId={} tradeId={}",
                saved.getId(), buyerId, tradeId);
    }

    /**
     * Kutayotgan manzil bor, lekin uni biriktiradigan akkount yo'q —
     * bo'sh kartochka ochiladi.
     *
     * <p>Obmenda ikkala taraf ham akkount oladi; e'lon esa bittasida.
     * Ma'lumotini egasi keyin o'zi to'ldiradi, muhimi — manzil yo'qolmaydi
     * va u qaysi savdodan kelgani ko'rinib turadi.
     */
    private void openAccountForWaitingEmail(UUID tradeId, UUID userId) {
        if (tradeId == null || userId == null) return;
        pendingEmails.findByTradeIdAndUserId(tradeId, userId).ifPresent(pending -> {
            if (accounts.findByOwnerIdAndSourceTradeId(userId, tradeId).isPresent()) {
                pendingEmails.delete(pending);
                return;
            }
            UserAccount account = UserAccount.builder()
                    .id(UUID.randomUUID())
                    .ownerId(userId)
                    .title("Savdodan kelgan akkount")
                    .attributes(new HashMap<>())
                    .mediaMessageIds(new ArrayList<>())
                    .status(UserAccountStatus.ACTIVE)
                    .sourceTradeId(tradeId)
                    .email(pending.getEmail())
                    .emailSource(EmailSource.PLATFORM)
                    .build();
            UserAccount saved = accounts.saveAndFlush(account);
            pendingEmails.delete(pending);
            log.info("Bare account opened for handed-over mailbox: accountId={} tradeId={}",
                    saved.getId(), tradeId);
        });
    }

    /**
     * Savdo pochtasi egasini topdi — manzil akkountga yoziladi.
     *
     * <p>Akkount hali ochilmagan bo'lishi mumkin (hodisalar ikki xil
     * topikda keladi): o'shanda manzil kutib turadi va akkount ochilganda
     * unga biriktiriladi.
     */
    @Transactional
    public void onMailboxHandedOver(UUID tradeId, UUID userId, String email) {
        if (tradeId == null || userId == null || email == null || email.isBlank()) {
            return;
        }
        accounts.findByOwnerIdAndSourceTradeId(userId, tradeId).ifPresentOrElse(account -> {
            account.setEmail(email);
            account.setEmailSource(EmailSource.PLATFORM);
            accounts.saveAndFlush(account);
            log.info("Mailbox attached to account: accountId={} tradeId={}", account.getId(), tradeId);
        }, () -> {
            pendingEmails.save(new PendingAccountEmail(tradeId, userId, email, null));
            log.info("Mailbox address is waiting for its account: tradeId={} userId={}", tradeId, userId);
        });
    }

    /** Kartochkada ko'rinadigan qisqa nom — tavsifning birinchi qatori. */
    private static String shortTitle(String description) {
        String firstLine = description.strip().split("\\R", 2)[0].strip();
        return firstLine.length() <= 60 ? firstLine : firstLine.substring(0, 57) + "…";
    }

    /**
     * Egasi e'lonni qo'lda "sotildi" deb belgiladi — akkount endi unda emas.
     *
     * <p>Email ham uziladi: platforma pochtasi bo'lsa u xaridorning qo'lida
     * qoladi va sotuvchining ro'yxatida turishi chalg'itadi.
     */
    @Transactional
    public void onListingSoldByOwner(UUID listingId) {
        accounts.findByCurrentListingId(listingId).ifPresent(account -> {
            account.setStatus(UserAccountStatus.ARCHIVED);
            account.setArchivedReason(ArchivedReason.SOLD_ELSEWHERE);
            account.setEmail(null);
            account.setEmailSource(null);
            account.setMailboxId(null);
            account.setCurrentListingId(null);
            accounts.saveAndFlush(account);
            log.info("Account archived after manual sale: accountId={} listingId={}",
                    account.getId(), listingId);
        });
    }
}
