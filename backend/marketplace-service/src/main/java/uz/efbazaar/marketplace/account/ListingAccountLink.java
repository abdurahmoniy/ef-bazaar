package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Instant;
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
    public void onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId, String kind) {
        onTradeSucceeded(tradeId, listingId, buyerId, sellerId, kind, null);
    }

    /**
     * @param giveAccountId obmenda xaridor bergan akkount; null — "Boshqa"
     * @return yopilishi kerak bo'lgan e'lon (berilgan akkountning e'loni) yoki null
     */
    @Transactional
    public UUID onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId,
                                 String kind, UUID giveAccountId) {
        // Obmenda sotuvchi ham akkount oladi — lekin uning ortida e'lon yo'q,
        // shuning uchun faqat pochtasi bo'lgan bo'sh kartochka ochiladi.
        // Busiz o'sha manzil kutish jadvalida abadiy qolib ketardi.
        boolean swap = "SWAP".equals(kind) || "SWAP_SURCHARGE".equals(kind);
        UUID listingToClose = null;
        if (swap && giveAccountId != null) {
            listingToClose = handOverGivenAccount(tradeId, giveAccountId, buyerId, sellerId);
        } else {
            openAccountForSwapRecipient(tradeId, sellerId, swap);
        }

        if (listingId == null || buyerId == null || tradeId == null) {
            log.debug("trade-succeeded without ids, skipping account handover");
            return listingToClose;
        }
        if (accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId).isPresent()) {
            log.debug("Account for trade {} already moved to {}", tradeId, buyerId);
            return listingToClose;
        }

        accounts.findByCurrentListingId(listingId).ifPresent(sellerAccount -> {
            sellerAccount.setStatus(UserAccountStatus.ARCHIVED);
            sellerAccount.setArchivedReason(ArchivedReason.SOLD_ON_PLATFORM);
            sellerAccount.setArchivedAt(Instant.now());
            sellerAccount.setSoldPrice(listings.findById(listingId).map(Listing::getPrice).orElse(null));
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
            return listingToClose;
        }

        Map<String, Object> attributes = listing.getAttributes() == null
                ? new HashMap<>() : new HashMap<>(listing.getAttributes());
        LISTING_ONLY_ATTRIBUTES.forEach(attributes::remove);

        UserAccount buyerAccount = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(buyerId)
                .title(swap ? "Obmendan kelgan akkount" : "Savdodan kelgan akkount")
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
        return listingToClose;
    }

    /**
     * Obmenda xaridor tanlagan akkount sotuvchiga ko'chadi.
     *
     * <p>Xuddi sotuvdagidek: berayotgan tarafda arxivga tushadi, oluvchida
     * to'liq nusxa ochiladi. Bo'sh kartochka ochilmaydi — ma'lumot bor.
     */
    private UUID handOverGivenAccount(UUID tradeId, UUID giveAccountId, UUID buyerId, UUID sellerId) {
        if (tradeId == null || sellerId == null) return null;
        if (accounts.findByOwnerIdAndSourceTradeId(sellerId, tradeId).isPresent()) {
            log.debug("Swap account for trade {} already moved to {}", tradeId, sellerId);
            return null;
        }
        UserAccount given = accounts.findById(giveAccountId).orElse(null);
        // ACTIVE shart: obmen tirik turganda akkount boshqa yo'l bilan (masalan, e'loni
        // sotilib) ketgan bo'lishi mumkin — uni yana berish ikki egani keltirib chiqarardi.
        if (given == null || !given.getOwnerId().equals(buyerId)
                || given.getStatus() != UserAccountStatus.ACTIVE) {
            log.warn("Given account {} is gone, inactive or not the buyer's — seller {} gets a bare card from trade {}",
                    giveAccountId, sellerId, tradeId);
            openAccountForSwapRecipient(tradeId, sellerId, true);
            return null;
        }
        UUID listingToClose = given.getCurrentListingId();

        given.setStatus(UserAccountStatus.ARCHIVED);
        given.setArchivedReason(ArchivedReason.SWAPPED_ON_PLATFORM);
        given.setArchivedAt(Instant.now());
        given.setEmail(null);
        given.setEmailSource(null);
        given.setMailboxId(null);
        given.setCurrentListingId(null);
        accounts.saveAndFlush(given);

        UserAccount received = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(sellerId)
                .title(given.getTitle())
                .description(given.getDescription())
                .attributes(given.getAttributes() == null ? new HashMap<>() : new HashMap<>(given.getAttributes()))
                .mediaMessageIds(given.getMediaMessageIds() == null
                        ? new ArrayList<>() : new ArrayList<>(given.getMediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .sourceTradeId(tradeId)
                .build();
        pendingEmails.findByTradeIdAndUserId(tradeId, sellerId).ifPresent(pending -> {
            received.setEmail(pending.getEmail());
            received.setEmailSource(EmailSource.PLATFORM);
            pendingEmails.delete(pending);
        });
        UserAccount saved = accounts.saveAndFlush(received);
        inventory.replace(saved.getId(), given.getAttributes() == null ? null : given.getAttributes().get(SQUAD_KEY));
        log.info("Swap account handed over: from={} to={} tradeId={}", given.getId(), saved.getId(), tradeId);
        return listingToClose;
    }

    /**
     * Obmenda sotuvchi olgan akkountning e'loni yo'q —
     * bo'sh kartochka ochiladi.
     *
     * <p>Obmenda ikkala taraf ham akkount oladi; e'lon esa bittasida.
     * Ma'lumotini egasi keyin o'zi to'ldiradi, muhimi — manzil yo'qolmaydi
     * va u qaysi savdodan kelgani ko'rinib turadi.
     */
    private void openAccountForSwapRecipient(UUID tradeId, UUID userId, boolean swap) {
        if (tradeId == null || userId == null) return;
        var pending = pendingEmails.findByTradeIdAndUserId(tradeId, userId);
        // Old events have no kind; a waiting seller mailbox still identifies a swap.
        // New swap events open the account even when its mailbox arrives later.
        if (!swap && pending.isEmpty()) return;
        if (accounts.findByOwnerIdAndSourceTradeId(userId, tradeId).isPresent()) {
            pending.ifPresent(pendingEmails::delete);
            return;
        }
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(userId)
                .title("Obmendan kelgan akkount")
                .attributes(new HashMap<>())
                .mediaMessageIds(new ArrayList<>())
                .status(UserAccountStatus.ACTIVE)
                .sourceTradeId(tradeId)
                .build();
        pending.ifPresent(email -> {
            account.setEmail(email.getEmail());
            account.setEmailSource(EmailSource.PLATFORM);
        });
        UserAccount saved = accounts.saveAndFlush(account);
        pending.ifPresent(pendingEmails::delete);
        log.info("Bare account opened for swap recipient: accountId={} tradeId={}",
                saved.getId(), tradeId);
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

    /**
     * Ikki hodisa poygaga tushgan holatni yopadi.
     *
     * <p>Savdo yakunlangani va pochta topshirilgani ikki xil topikda keladi
     * va ikki xil tranzaksiyada ishlanadi. Bir vaqtda kelsalar hech biri
     * ikkinchisining hali commit qilinmagan yozuvini ko'rmaydi: biri
     * akkountni emailSIZ ochadi, ikkinchisi esa "akkount yo'q" deb manzilni
     * kutishga qo'yadi va uni endi hech kim olmaydi.
     *
     * <p>Shuning uchun har ikki tomon o'z ishini commit qilgach shu yerga
     * qaytadi. Oxirgi bo'lib tugagani ikkala qatorni ham ko'radi, ya'ni
     * kamida bittasi har doim ulaydi. Chaqiruv o'z tranzaksiyasida ishlashi
     * SHART — aks holda u yana o'sha ko'rmaydigan oynada qoladi.
     */
    @Transactional
    public void drainPendingEmail(UUID tradeId, UUID userId) {
        if (tradeId == null || userId == null) {
            return;
        }
        accounts.findByOwnerIdAndSourceTradeId(userId, tradeId).ifPresent(account ->
                pendingEmails.findByTradeIdAndUserId(tradeId, userId).ifPresent(pending -> {
                    // Tez yo'l allaqachon ulagan bo'lsa ustidan yozmaymiz:
                    // egasi keyin uni o'zi almashtirgan bo'lishi mumkin.
                    if (account.getEmail() == null || account.getEmail().isBlank()) {
                        account.setEmail(pending.getEmail());
                        account.setEmailSource(EmailSource.PLATFORM);
                        accounts.saveAndFlush(account);
                        log.info("Mailbox attached after the race: accountId={} tradeId={}",
                                account.getId(), tradeId);
                    }
                    pendingEmails.delete(pending);
                }));
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
            account.setArchivedAt(Instant.now());
            account.setSoldPrice(listings.findById(listingId).map(Listing::getPrice).orElse(null));
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
