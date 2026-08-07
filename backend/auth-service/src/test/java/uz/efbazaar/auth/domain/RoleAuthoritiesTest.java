package uz.efbazaar.auth.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoleAuthoritiesTest {

    @Test
    void plainUserGetsOnlyRoleUser() {
        assertThat(Role.USER.authorities()).containsExactly("ROLE_USER");
    }

    @Test
    void platformAdminAlsoGetsRoleUser() {
        assertThat(Role.ADMIN.authorities())
                .containsExactly("ROLE_USER", "ROLE_ADMIN");
    }

    @Test
    void tradeAdminKeepsRoleUserSoOrdinaryEndpointsStillWork() {
        assertThat(Role.TRADE_ADMIN.authorities())
                .containsExactly("ROLE_USER", "ROLE_TRADE_ADMIN");
    }

    @Test
    void everyRoleGrantsRoleUser() {
        for (Role r : Role.values()) {
            assertThat(r.authorities()).contains("ROLE_USER");
        }
    }
}
