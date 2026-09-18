package uz.efbazaar.marketplace.account;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.account.dto.UserAccountCreateRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserAccountService {

    /** Atributlar ichidagi o'yinchilar ro'yxatining kaliti — e'lon bilan bir xil. */
    private static final String SQUAD_KEY = "valuable_players";

    private final UserAccountRepository accounts;
    private final UserAccountCardInventory inventory;
    private final UserAccountPublisher publisher;

    @Transactional(readOnly = true)
    public List<UserAccount> list(UUID ownerId) {
        return accounts.findByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, UserAccountStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public UserAccount get(UUID id, UUID ownerId) {
        return accounts.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(MarketplaceException::accountNotFound);
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
        UserAccount account = get(id, ownerId);
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

    @Transactional
    public UserAccount setEmail(UUID id, UUID ownerId, String email) {
        UserAccount account = get(id, ownerId);
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
        UserAccount account = get(id, ownerId);
        if (account.isOnMarket()) {
            throw MarketplaceException.accountOnMarket();
        }
        accounts.delete(account);
        log.info("Account deleted: id={} ownerId={}", id, ownerId);
    }
}
