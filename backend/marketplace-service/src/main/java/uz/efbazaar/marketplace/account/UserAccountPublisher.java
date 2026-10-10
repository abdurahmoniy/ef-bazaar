package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.account.dto.PublishAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.service.ListingService;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Akkount bilan bozor o'rtasidagi yagona ko'prik.
 *
 * <p>Egalikni bevosita repozitoriydan o'qiydi va {@link UserAccountService}
 * ga bog'lanmaydi: aks holda servis tarqatish uchun publisher'ni chaqirganda
 * ikki bean bir-birini talab qilardi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserAccountPublisher {

    /**
     * E'longa KO'CHIRILADIGAN maydonlar ataylab shu klassda sanab o'tilgan.
     * "Emaildan boshqa hammasi" qoidasi bo'lganida, keyinchalik qo'shilgan
     * maxfiy ustun e'longa o'z-o'zidan sirg'alib o'tardi.
     */
    private static final Set<String> LISTING_ONLY_ATTRIBUTES = Set.of("exchange_mode");

    private final UserAccountRepository accounts;
    private final ListingService listings;

    @Transactional
    public Listing publish(UUID accountId, UUID ownerId, PublishAccountRequest request) {
        UserAccount account = owned(accountId, ownerId);
        if (account.isOnMarket()) {
            throw MarketplaceException.accountAlreadyPublished(account.getCurrentListingId());
        }
        if (account.getMediaMessageIds() == null || account.getMediaMessageIds().isEmpty()) {
            throw MarketplaceException.accountWithoutPhotos();
        }

        Map<String, Object> attributes = new HashMap<>(account.getAttributes());
        if (request.exchangeMode() != null && !request.exchangeMode().isBlank()) {
            attributes.put("exchange_mode", request.exchangeMode());
        }

        ListingCreateRequest listingRequest = new ListingCreateRequest(
                account.getDescription(),
                request.price(),
                request.priceNegotiable(),
                attributes,
                request.channelIds());

        // Rasmlar Telegram'da allaqachon turibdi — qayta yuklash yangi
        // message id lar yasab, akkount va e'lon rasmlarini ajratib yuborardi.
        Listing listing = listings.createWithUploadedMedia(
                ownerId, listingRequest, account.getMediaMessageIds());

        account.setCurrentListingId(listing.getId());
        account.setSourceListingId(listing.getId());
        accounts.saveAndFlush(account);
        log.info("Account published: accountId={} listingId={}", accountId, listing.getId());
        return listing;
    }

    @Transactional
    public UserAccount unpublish(UUID accountId, UUID ownerId) {
        UserAccount account = owned(accountId, ownerId);
        if (account.isOnMarket()) {
            listings.delete(account.getCurrentListingId(), ownerId);
            account.setCurrentListingId(null);
            log.info("Account unpublished: accountId={}", accountId);
        }
        return accounts.saveAndFlush(account);
    }

    /**
     * Akkount o'zgardi — bozorda tursa e'lon ham o'sha zahoti yangilanadi.
     *
     * <p>E'lon topilmasa (sotilgan yoki o'chirilgan) akkount saqlanadi va
     * bog'lanish uziladi: foydalanuvchining tahriri yo'qolmasligi kerak,
     * lekin endi yangilanadigan e'lon ham yo'q.
     */
    @Transactional
    public void propagate(UserAccount account) {
        if (!account.isOnMarket()) {
            return;
        }

        Map<String, Object> attributes = new HashMap<>(account.getAttributes());
        LISTING_ONLY_ATTRIBUTES.forEach(attributes::remove);

        try {
            listings.updateContent(account.getCurrentListingId(), account.getOwnerId(),
                    new ListingUpdateRequest(account.getDescription(), null, null, attributes),
                    account.getMediaMessageIds());
        } catch (MarketplaceException e) {
            log.info("Propagation skipped, unlinking: accountId={} listingId={} code={}",
                    account.getId(), account.getCurrentListingId(), e.getCode());
            account.setCurrentListingId(null);
            accounts.saveAndFlush(account);
        }
    }

    private UserAccount owned(UUID accountId, UUID ownerId) {
        UserAccount account = accounts.findByIdAndOwnerId(accountId, ownerId)
                .orElseThrow(MarketplaceException::accountNotFound);
        // Sotilgan akkount tarixda faqat o'qish uchun — bozorga qaytmaydi.
        if (account.getStatus() == UserAccountStatus.ARCHIVED) {
            throw MarketplaceException.accountArchived();
        }
        return account;
    }
}
