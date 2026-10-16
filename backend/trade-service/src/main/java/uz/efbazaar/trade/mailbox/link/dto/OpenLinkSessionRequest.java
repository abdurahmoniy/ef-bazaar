package uz.efbazaar.trade.mailbox.link.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * @param emailAlreadySet the account's Konami email already is this box (verifying
 *                        an address the user typed in): skip the email-change step
 */
public record OpenLinkSessionRequest(@NotNull UUID accountId, boolean emailAlreadySet) {}
