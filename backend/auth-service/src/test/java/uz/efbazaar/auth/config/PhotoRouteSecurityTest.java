package uz.efbazaar.auth.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * That "me" is not mistaken for a user id.
 *
 * <p>The public avatar rule is written as {@code /api/v1/users/*&#47;photo}, and a
 * single {@code *} matches one whole path segment — so {@code me} matched it,
 * {@code /users/me/photo} was reachable with no principal, and the endpoint
 * dereferenced null. An anonymous visitor loading an avatar got a 500 where a
 * 401 belonged.
 *
 * <p>Asserted on the matcher rather than through the app: the point is that
 * these two patterns overlap, which is a fact about the patterns and reads
 * plainly here.
 */
class PhotoRouteSecurityTest {

    private static final org.springframework.util.AntPathMatcher PATHS =
            new org.springframework.util.AntPathMatcher();
    private static final String PUBLIC_AVATAR = "/api/v1/users/*/photo";

    private static boolean matchesPublicRule(String path) {
        return PATHS.match(PUBLIC_AVATAR, path);
    }

    @Test
    void thePublicAvatarPatternAlsoMatchesMe() {
        // Not a bug in itself — it is why the ordering in SecurityConfig
        // matters, and why this test keeps the reason visible.
        assertThat(matchesPublicRule("/api/v1/users/me/photo")).isTrue();
    }

    @Test
    void itAlsoMatchesARealUserId() {
        assertThat(matchesPublicRule(
                "/api/v1/users/0f2b9a1c-1111-4222-8333-444455556666/photo")).isTrue();
    }

    @Test
    void itDoesNotReachAcrossSegments() {
        // A single star stops at the slash, which is why /me/photo and only
        // /me/photo had to be claimed ahead of it.
        assertThat(matchesPublicRule("/api/v1/users/me/extra/photo")).isFalse();
    }
}
