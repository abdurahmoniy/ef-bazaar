package uz.efbazaar.trade.mail.dto;

import java.time.Instant;
import java.util.List;

/**
 * Full message payload for the reader pane. Exactly one of
 * {@code bodyHtml} / {@code bodyPlain} is guaranteed non-null. When both
 * parts exist we send both — the frontend picks HTML by default and offers
 * the plain fallback as a toggle.
 *
 * <p>{@code bodyHtml} has ALREADY been sanitised server-side (Jsoup safelist)
 * — external images are stripped, {@code <script>} / {@code <iframe>} /
 * {@code on*} attributes never make it across the wire.
 */
public record MessageDetail(
        String messageId,
        String subject,
        String fromName,
        String fromAddress,
        List<String> toAddresses,
        List<String> ccAddresses,
        Instant receivedAt,
        String bodyHtml,
        String bodyPlain,
        List<AttachmentMeta> attachments,
        boolean seen
) {}
