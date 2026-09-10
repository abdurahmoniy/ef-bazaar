package uz.efbazaar.payment.analytics.dto;

/**
 * How far referral spending reached: how many payouts, to how many people.
 *
 * @param payouts    referral transactions posted
 * @param recipients distinct users who received at least one
 */
public record ReferralReachRow(long payouts, long recipients) {}
