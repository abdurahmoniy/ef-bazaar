package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mailbox.config.MailboxDomains;

import static org.assertj.core.api.Assertions.assertThat;

class MailboxDomainsTest {

    @Test
    void parsesListDefaultAndPremium() {
        var d = new MailboxDomains(" efbazaar.uz , EFOOTBALL.uz ", "MAX, STAFF");

        assertThat(d.all()).containsExactly("efbazaar.uz", "efootball.uz");
        assertThat(d.defaultDomain()).isEqualTo("efbazaar.uz");
        assertThat(d.allowed("efootball.uz")).isTrue();
        assertThat(d.allowed("EFOOTBALL.UZ")).isTrue();
        assertThat(d.allowed("gmail.com")).isFalse();
        assertThat(d.allowed(null)).isFalse();
        assertThat(d.premium("efootball.uz")).isTrue();
        assertThat(d.premium("efbazaar.uz")).isFalse();
        assertThat(d.premium("gmail.com")).isFalse();
        assertThat(d.premiumPlans()).containsExactlyInAnyOrder("MAX", "STAFF");
    }

    @Test
    void blankFallsBackToEfbazaar() {
        assertThat(new MailboxDomains("", "").all()).containsExactly("efbazaar.uz");
    }
}
