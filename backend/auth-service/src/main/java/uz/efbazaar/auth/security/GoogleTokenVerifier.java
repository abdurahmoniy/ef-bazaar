package uz.efbazaar.auth.security;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.auth.exception.AuthException;

import java.security.GeneralSecurityException;
import java.util.Collections;

/**
 * Verifies Google ID tokens (JWT) issued via the Google Identity Services SDK.
 * <p>The verifier checks signature (JWKS), audience (our client ID), issuer
 * (accounts.google.com) and expiry. Returns {@code sub} (Google user ID) and
 * {@code email} from the payload.
 */
@Slf4j
@Component
public class GoogleTokenVerifier {

    private final String clientId;
    private GoogleIdTokenVerifier verifier;

    public GoogleTokenVerifier(@Value("${app.google.client-id:}") String clientId) {
        this.clientId = clientId;
    }

    @PostConstruct
    void init() {
        if (clientId == null || clientId.isBlank()) {
            log.warn("Google client ID not configured — Google login/link will be unavailable");
            return;
        }
        this.verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(clientId))
                .build();
    }

    public VerifiedGoogleIdentity verify(String idToken) {
        if (verifier == null) {
            throw AuthException.googleNotConfigured();
        }
        try {
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null) {
                throw AuthException.invalidGoogleToken();
            }
            GoogleIdToken.Payload p = token.getPayload();
            if (!Boolean.TRUE.equals(p.getEmailVerified())) {
                throw AuthException.googleEmailUnverified();
            }
            // {@code given_name} is a standard OpenID Connect claim — Google
            // populates it from the user's profile. Falls back to full name /
            // email prefix when missing so displayName is never empty.
            Object givenName = p.get("given_name");
            return new VerifiedGoogleIdentity(
                    p.getSubject(),
                    p.getEmail(),
                    givenName == null ? null : givenName.toString());
        } catch (GeneralSecurityException | java.io.IOException e) {
            log.warn("Google ID token verification failed: {}", e.getMessage());
            throw AuthException.invalidGoogleToken();
        }
    }

    public record VerifiedGoogleIdentity(String googleId, String email, String givenName) {}
}
