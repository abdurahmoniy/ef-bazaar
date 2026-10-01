package uz.efbazaar.recommendation.security;

import java.util.List;
import java.util.UUID;

/** nginx uzatgan identity headerlari. marketplace va payment bilan bir xil shakl. */
public record AuthenticatedUser(UUID userId, List<String> roles) {}
