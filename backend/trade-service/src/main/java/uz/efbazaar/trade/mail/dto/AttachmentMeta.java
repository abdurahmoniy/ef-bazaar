package uz.efbazaar.trade.mail.dto;

/**
 * Attachment descriptor — enough for the sidebar chip (filename + size) plus
 * an ID the frontend uses to download the binary. IDs are the MIME part's
 * position within the message (e.g. "1", "2.1") so the server can re-locate
 * the part on demand without persisting any state.
 */
public record AttachmentMeta(
        String attachmentId,
        String filename,
        String contentType,
        long sizeBytes
) {}
