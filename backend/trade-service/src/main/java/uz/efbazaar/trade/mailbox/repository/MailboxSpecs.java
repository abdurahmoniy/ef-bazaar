package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;

import java.util.UUID;

/** Optional filters for the admin mailbox list. Each returns null when unset. */
public final class MailboxSpecs {

    private MailboxSpecs() {}

    public static Specification<Mailbox> emailContains(String needle) {
        if (needle == null || needle.isBlank()) return null;
        String pattern = "%" + needle.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.get("email")), pattern);
    }

    public static Specification<Mailbox> ownedBy(UUID ownerUserId) {
        if (ownerUserId == null) return null;
        return (root, query, cb) -> cb.equal(root.get("ownerUserId"), ownerUserId);
    }

    public static Specification<Mailbox> hasSource(MailboxSource source) {
        if (source == null) return null;
        return (root, query, cb) -> cb.equal(root.get("source"), source);
    }

    /** Registered but not yet confirmed by Mailcow. */
    public static Specification<Mailbox> pendingOnly(boolean pending) {
        if (!pending) return null;
        return (root, query, cb) -> cb.isNull(root.get("provisionedAt"));
    }

    /** No owner attached — an in-flight trade mailbox or a leftover. */
    public static Specification<Mailbox> unassignedOnly(boolean unassigned) {
        if (!unassigned) return null;
        return (root, query, cb) -> cb.isNull(root.get("ownerUserId"));
    }
}
