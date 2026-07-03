package uz.efbazaar.marketplace.observability;

import org.slf4j.Marker;
import org.slf4j.MarkerFactory;

/**
 * Marker for important INFO logs that should reach the Telegram log channel
 * even though they are below the WARN forwarding threshold.
 *
 * <p>Usage: {@code log.info(NotifyMarker.NOTIFY, "...")}. {@link KafkaLogForwarder}
 * forwards any event that is WARN+ OR carries this marker.
 */
public final class NotifyMarker {

    public static final String NAME = "NOTIFY";
    public static final Marker NOTIFY = MarkerFactory.getMarker(NAME);

    private NotifyMarker() {}
}
