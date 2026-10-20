package uz.efbazaar.recommendation.watch;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.recommendation.exception.GlobalExceptionHandler;
import uz.efbazaar.recommendation.security.HeaderAuthenticationFilter;
import uz.efbazaar.recommendation.security.SecurityConfig;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.Authorization;

import java.util.List;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers={SavedSearchController.class,WatchAuthorizationController.class},properties="app.internal-api-secret=test-only-secret")
@Import({SecurityConfig.class,HeaderAuthenticationFilter.class,GlobalExceptionHandler.class})
class SavedSearchControllerTest {
    @Autowired MockMvc mvc;
    @MockBean SavedSearchService service;
    final String user=UUID.randomUUID().toString();
    @Test void savedSearchesRequireOwnerIdentity() throws Exception {
        mvc.perform(get("/api/v1/saved-searches")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/saved-searches").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void creationUsesPrincipalAndRejectsEveryUnsupportedCriterion() throws Exception {
        for(String field:List.of("platform","text","attributes","hasGooglePlayLink")) {
            mvc.perform(post("/api/v1/saved-searches").header("X-User-Id",user).contentType("application/json")
                    .content("{\"name\":\"search\",\"minPrice\":10,\""+field+"\":\"unsupported\"}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
        mvc.perform(post("/api/v1/saved-searches").header("X-User-Id",user).contentType("application/json")
                        .content("{\"name\":\"search\",\"minPrice\":10}"))
                .andExpect(status().isCreated());
        verify(service).create(eq(UUID.fromString(user)),any());
    }
    @Test void authorizationUsesInternalSecretAndNeverTrustsUserHeaders() throws Exception {
        String body="{\"intentId\":\""+UUID.randomUUID()+"\",\"userId\":\""+user+"\",\"listingId\":\""+UUID.randomUUID()+"\",\"publicationVersion\":1}";
        for(String secret:List.of("","wrong")) {
            mvc.perform(post("/internal/rec/v1/watches/authorize").header("X-Internal-Secret",secret)
                            .header("X-User-Id",user).contentType("application/json").content(body))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
        when(service.authorize(any())).thenReturn(new Authorization(true,List.of(),"DIGEST"));
        mvc.perform(post("/internal/rec/v1/watches/authorize").header("X-Internal-Secret","test-only-secret")
                        .contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.eligible").value(true));
    }
}
