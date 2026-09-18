package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;

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
