package uz.efbazaar.payment.withdrawal.dto;

import jakarta.validation.constraints.Size;

/** Optional note; shown to the user, so it is the place to say why a payout was declined. */
public record WithdrawalCloseRequest(@Size(max = 256) String note) {}
