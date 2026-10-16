package uz.efbazaar.trade.mailbox.custom;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.config.MailboxDomains;
import uz.efbazaar.trade.mailbox.custom.dto.AvailabilityResponse;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.service.CustomSlotService;
import uz.efbazaar.trade.plan.service.EntitlementService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Self-named mailboxes: is the name free, may this user have it, give it to them.
 *
 * <p>The address is never given out twice — a deleted row still holds its
 * name, because a Konami account may still point at it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomMailboxService {

    private final MailboxRepository mailboxes;
    private final MailboxDomains domains;
    private final CustomSlotService customSlots;
    private final EntitlementService entitlements;
    private final TradeEventPublisher events;

    @Transactional(readOnly = true)
    public AvailabilityResponse availability(UUID userId, String rawLocal, String rawDomain) {
        String local = CustomNamePolicy.normalize(rawLocal);
        String domain = domainOf(rawDomain);
        String email = local + "@" + domain;
        String reason = unavailableReason(local, domain, email);
        if (reason != null) return new AvailabilityResponse(email, false, reason, false, null);
        String block = claimBlock(userId, domain);
        return new AvailabilityResponse(email, true, null, block == null, block);
    }

    @Transactional
    public Mailbox claim(UUID userId, String rawLocal, String rawDomain) {
        String local = CustomNamePolicy.normalize(rawLocal);
        String domain = domainOf(rawDomain);
        String email = local + "@" + domain;
        String reason = unavailableReason(local, domain, email);
        if (reason != null) {
            throw switch (reason) {
                case "TAKEN" -> new ApiCodeException(HttpStatus.CONFLICT, "taken", "Bu nom band");
                case "RESERVED" -> new ApiCodeException(HttpStatus.BAD_REQUEST, "reserved", "Bu nom zahirada");
                case "DOMAIN_NOT_ALLOWED" -> new ApiCodeException(HttpStatus.BAD_REQUEST,
                        "domain_not_allowed", "Bu domen ruxsat etilmagan");
                default -> new ApiCodeException(HttpStatus.BAD_REQUEST, "invalid",
                        "5–24 belgi, faqat lotin harf va raqam");
            };
        }
        String block = claimBlock(userId, domain);
        if ("PLAN_DOMAIN".equals(block)) {
            throw new ApiCodeException(HttpStatus.FORBIDDEN, "plan_domain",
                    "Bu domen faqat Aristokrat tarifida");
        }
        if ("NO_SLOT".equals(block)) {
            throw new ApiCodeException(HttpStatus.FORBIDDEN, "no_slot", "Barcha custom slotlar band");
        }
        Instant now = Instant.now();
        Mailbox row = Mailbox.builder()
                .id(UUID.randomUUID())
                .email(email)
                .ownerUserId(userId)
                .kind(MailboxKind.CUSTOM)
                .source(MailboxSource.USER)
                // Placeholder credentials until the worker answers, as for admin rows.
                .encryptedPassword(new byte[]{0})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(now)
                .handedOffAt(now)
                .build();
        try {
            mailboxes.saveAndFlush(row);
        } catch (DataIntegrityViolationException e) {
            // Somebody took the same address between our check and the insert.
            throw new ApiCodeException(HttpStatus.CONFLICT, "taken", "Bu nom band");
        }
        // Deferred to after commit by the publisher.
        events.mailboxProvisionRequest(row.getId(), local, domain);
        log.info("User {} claimed custom mailbox {}", userId, email);
        return row;
    }

    @Transactional(readOnly = true)
    public List<Mailbox> listOwned(UUID userId) {
        return mailboxes.findAccessOrderOwnedBy(userId, MailboxKind.CUSTOM);
    }

    private String domainOf(String rawDomain) {
        return rawDomain == null || rawDomain.isBlank()
                ? domains.defaultDomain()
                : rawDomain.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private String unavailableReason(String local, String domain, String email) {
        if (!domains.allowed(domain)) return "DOMAIN_NOT_ALLOWED";
        var problem = CustomNamePolicy.check(local);
        if (problem.isPresent()) return problem.get().name();
        if (mailboxes.existsByEmail(email)) return "TAKEN";
        return null;
    }

    private String claimBlock(UUID userId, String domain) {
        if (domains.premium(domain) && !domains.premiumPlans().contains(entitlements.planFor(userId))) {
            return "PLAN_DOMAIN";
        }
        if (!customSlots.canAllocate(userId)) return "NO_SLOT";
        return null;
    }
}
