package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Google Identity Services credential payload — both /google/link and /google/login
 * accept the ID token (JWT) returned by GIS on the browser.
 */
public record GoogleAuthRequest(@NotBlank String idToken) {}
