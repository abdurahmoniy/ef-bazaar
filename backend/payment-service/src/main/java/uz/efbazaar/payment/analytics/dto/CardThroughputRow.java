package uz.efbazaar.payment.analytics.dto;

import java.util.UUID;

/**
 * How much money a card has actually taken in.
 *
 * <p>Deliberately not "profit per card". Commission is posted against the trade
 * that earned it and carries no {@code card_id}, so no per-card profit exists
 * to report — the card is a pipe, not a business unit. Throughput is what the
 * data can honestly answer: which pipe the deposits went through.
 *
 * @param paidInvoices how many deposits settled on it
 */
public record CardThroughputRow(UUID cardId, long throughputTiyin, long paidInvoices) {}
