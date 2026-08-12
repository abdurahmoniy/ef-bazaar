package uz.efbazaar.payment.invoice.domain;

/**
 * Which rail an invoice belongs to. BY_CARD is the transfer-to-our-own-card
 * rail; hosted providers (Click, Payme) slot in here later behind the same
 * PaymentProvider interface.
 */
public enum PaymentProviderId { BY_CARD, MOCK }
