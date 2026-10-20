package uz.efbazaar.marketplace.push;

import uz.efbazaar.marketplace.domain.Notification;
import java.util.Map;
import java.util.UUID;

public record NotificationPushEvent(UUID recipientUserId, Map<String, String> data) {
    public static NotificationPushEvent from(Notification n) {
        String actor = n.getActorDisplayName() == null || n.getActorDisplayName().isBlank() ? "Foydalanuvchi" : n.getActorDisplayName().trim();
        actor = actor.substring(0, Math.min(actor.length(), 64));
        String body = switch (n.getType()) {
            case WATCH_MATCH -> "Kuzatuvingizga mos yangilik";
            case WATCH_DIGEST -> "Kuzatuvlar bo‘yicha kunlik jamlanma";
            case CHAT_CREATED -> actor + " e’loningiz bo‘yicha chat ochdi";
            case CHAT_MESSAGE -> actor + " sizga xabar yozdi";
            case TRUST_WARNING -> "Profilingizga ogohlantirish berildi";
            case TRUST_BLOCKED -> "Profilingiz bloklandi";
            case TRUST_UNBLOCKED -> "Profilingiz blokdan chiqarildi";
            case TRADE_ADMIN_INVITED -> "Siz savdo moderatsiyasiga taklif qilindingiz";
            case WALLET_CREDITED -> "Hamyoningiz to‘ldirildi";
            case WITHDRAWAL_REQUESTED -> "Yangi pul yechish so‘rovi";
            case WITHDRAWAL_PAID -> "Pul yechish so‘rovingiz bajarildi";
            case WITHDRAWAL_REJECTED -> "Pul yechish so‘rovingiz rad etildi";
            case TRADE_MAILBOX_RECEIVED -> "Savdo yakunlandi — akkount emaili profilingizga qo‘shildi";
            case TRADE_MAILBOX_RETURNED -> "Savdo yakunlanmadi — email profilingizga biriktirildi";
            case CUSTOM_MAILBOX_FREED -> "Custom emailingiz bo‘shadi — boshqa akkountingizga ulang";
            case TRADE_PROPOSAL_CREATED -> "Sizga yangi savdo taklifi yuborildi";
            case TRADE_STARTED -> "Savdo boshlandi";
            case TRADE_EMAIL_CHANGE_CODE -> "Konami emailini o‘zgartirish kodi: " + n.getVerificationCode();
            case TRADE_LOGIN_CODE -> "Konami kirish kodi: " + n.getVerificationCode();
            case TRADE_EMAIL_CHANGED -> "Sotuvchi Konami emailini o‘zgartirdi";
            case TRADE_PASSWORD_SENT -> "Konami paroli yuborildi — tekshirib tasdiqlang";
            case TRADE_SUCCESS -> "Savdo muvaffaqiyatli yakunlandi";
            case TRADE_REJECTED -> "Savdo rad etildi";
            case TRADE_ORPHANED -> "Savdo muddati tugadi";
            case PARTNER_APPROVED -> "Hamkorligingiz tasdiqlandi";
            case PARTNER_REJECTED -> "Hamkorlik arizasi rad etildi";
            case PARTNER_CANCELLED -> "Hamkorligingiz to‘xtatildi";
        };
        return new NotificationPushEvent(n.getUserId(), Map.of(
                "notificationId", n.getId().toString(), "recipientUserId", n.getUserId().toString(),
                "title", "efBazaar", "body", body, "url", destination(n)));
    }

    private static String destination(Notification n) {
        return switch (n.getType()) {
            case WATCH_MATCH, WATCH_DIGEST -> "/watches";
            case WITHDRAWAL_REQUESTED -> "/admin/payments/withdrawals?ticket=" + (n.getWithdrawalId() == null ? "" : n.getWithdrawalId());
            case WALLET_CREDITED, WITHDRAWAL_PAID, WITHDRAWAL_REJECTED -> "/hamyon";
            case PARTNER_APPROVED -> "/partner";
            case CUSTOM_MAILBOX_FREED -> "/mailboxes/custom";
            case PARTNER_REJECTED, PARTNER_CANCELLED -> "/partnership";
            // Keep external mail and feature-gated moderation links in the notification center.
            case TRADE_MAILBOX_RECEIVED, TRADE_MAILBOX_RETURNED, TRADE_ADMIN_INVITED -> "/notifications";
            default -> n.getChatId() != null ? "/chats/" + n.getChatId()
                    : n.getListingId() != null ? "/marketplace/" + n.getListingId()
                    : n.getTradeId() != null ? "/chats" : "/notifications";
        };
    }
}
