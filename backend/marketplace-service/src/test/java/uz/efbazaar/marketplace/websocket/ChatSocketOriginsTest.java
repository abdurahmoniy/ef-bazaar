package uz.efbazaar.marketplace.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import java.net.URI;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatSocketOriginsTest {
    @Test void exactConfiguredDevelopmentOriginIsAcceptedButSimilarOriginIsNot() {
        var interceptor = new ChatSocketConfiguration.SameOriginAuthenticatedHandshake(List.of("http://localhost:3000"));
        var request = mock(ServerHttpRequest.class);
        var headers = new HttpHeaders(); headers.setOrigin("http://localhost:3000");
        when(request.getHeaders()).thenReturn(headers);
        when(request.getURI()).thenReturn(URI.create("http://nginx/ws/chat"));
        when(request.getPrincipal()).thenReturn(new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(UUID.randomUUID(), null, List.of()), null, List.of()));
        assertThat(interceptor.beforeHandshake(request, mock(ServerHttpResponse.class), mock(ChatSocketHandler.class), new HashMap<>())).isTrue();
        headers.setOrigin("http://localhost:3001");
        assertThat(interceptor.beforeHandshake(request, mock(ServerHttpResponse.class), mock(ChatSocketHandler.class), new HashMap<>())).isFalse();
    }
    @Test void configurationRejectsWildcardCredentialsPathsAndOpaqueOrigins() {
        for (String origin : List.of("*", "http://*.example.com", "null", "https://example.com/path", "https://user:pass@example.com", "file://example.com"))
            assertThatThrownBy(() -> new ChatSocketConfiguration(mock(ChatSocketHandler.class), origin)).isInstanceOf(IllegalArgumentException.class);
    }
}
