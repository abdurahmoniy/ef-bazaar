package uz.efbazaar.access.security;

import java.util.List;
import java.util.UUID;

/** nginx uzatgan identity headerlari. marketplace va payment bilan bir xil shakl. */
public record AuthenticatedUser(UUID userId, List<String> roles) {}
