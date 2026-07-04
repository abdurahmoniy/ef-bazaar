package uz.efbazaar.auth.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class InternalSecretFilterTest {

    private final String secret = "shared-secret-value";
    private final InternalSecretFilter filter =
            new InternalSecretFilter(new InternalApiProperties(secret));

    @Test
    void nonInternalPath_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/users/me");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, times(1)).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void internalPath_withCorrectHeader_passesThrough() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/internal/auth/v1/users/names/batch");
        request.addHeader(InternalSecretFilter.HEADER, secret);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, times(1)).doFilter(request, response);
    }

    @Test
    void internalPath_missingHeader_returns403() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/internal/auth/v1/users/names/batch");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void internalPath_wrongHeader_returns403() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/internal/auth/v1/users/names/batch");
        request.addHeader(InternalSecretFilter.HEADER, "not-the-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void internalPath_blankConfiguredSecret_alwaysRejects() throws Exception {
        InternalSecretFilter blankFilter =
                new InternalSecretFilter(new InternalApiProperties(""));
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/internal/auth/v1/users/names/batch");
        request.addHeader(InternalSecretFilter.HEADER, "");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        blankFilter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(403);
    }
}
