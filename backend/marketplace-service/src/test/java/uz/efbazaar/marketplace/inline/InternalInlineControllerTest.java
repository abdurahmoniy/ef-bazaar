package uz.efbazaar.marketplace.inline;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import uz.efbazaar.marketplace.security.InternalApiProperties;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InternalInlineControllerTest {

    final InlineListingService service = mock(InlineListingService.class);
    final InternalInlineController controller = new InternalInlineController(service);

    @Test
    void passesTelegramIdQueryAndOffsetThrough() {
        var page = new InlineListingService.InlinePage(true, List.of(), null);
        when(service.find(42L, "messi", 20)).thenReturn(page);

        assertThat(controller.listings(42L, "messi", 20)).isSameAs(page);
    }

    @Test
    void missingQueryAndOffsetDefault() {
        when(service.find(42L, "", 0)).thenReturn(new InlineListingService.InlinePage(false, List.of(), null));

        assertThat(controller.listings(42L, null, null).linked()).isFalse();
    }

    @Test
    void theInlinePathIsBehindTheInternalSecret() throws Exception {
        var filter = new InternalSecretFilter(new InternalApiProperties("s3cret"));
        var request = new MockHttpServletRequest("GET", "/internal/marketplace/v1/inline/listings");
        request.setRequestURI("/internal/marketplace/v1/inline/listings");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(chain.getRequest()).isNull();
    }
}
