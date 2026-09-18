package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserAccountController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class UserAccountControllerTest {

    @Autowired MockMvc mvc;
    @MockBean UserAccountService accounts;

    @Test
    void list_readsOnlyTheCallersAccounts() throws Exception {
        UUID ownerId = UUID.randomUUID();
        when(accounts.list(ownerId)).thenReturn(List.of());

        mvc.perform(get("/api/v1/accounts")
                        .header("X-User-Id", ownerId.toString())
                        .header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isOk());

        verify(accounts).list(ownerId);
    }

    /**
     * 403, 401 emas: marketplace zanjirida alohida entry point yo'q va
     * identity headerisiz so'rov Spring'ning standart javobini oladi.
     * Muhimi shu — anonim so'rov boshqa birovning akkountlarini ko'rmaydi.
     */
    @Test
    void anonymousRequestIsRejected() throws Exception {
        mvc.perform(get("/api/v1/accounts")).andExpect(status().isForbidden());
    }
}
