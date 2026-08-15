package uz.efbazaar.payment.notify;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class AdminTelegramNotifierTest {

    private static final InvoiceNotice NOTICE = new InvoiceNotice(
            UUID.randomUUID(), UUID.randomUUID(), "4556", "ISMOILOV XUSNIDDIN",
            10_000_000L, 10_010_000L, Instant.parse("2026-08-12T15:41:00Z"), null);

    /** Records what was sent; can be told to fail like a dead bot. */
    static class FakeBot implements BotClient {
        final List<String> posted = new ArrayList<>();
        final List<Long> deleted = new ArrayList<>();
        boolean explode;
        long nextId = 1;

        /** Direct messages, in order. Recorded so a test can assert the wording. */
        final java.util.List<String> dms = new java.util.ArrayList<>();

        @Override public OptionalLong sendDirectMessage(long chatId, String html) {
            if (explode) throw new IllegalStateException("bot is down");
            dms.add(chatId + ":" + html);
            return OptionalLong.of(nextId++);
        }

        @Override public OptionalLong postPaymentNotice(String html) {
            if (explode) throw new IllegalStateException("bot is down");
            posted.add(html);
            return OptionalLong.of(nextId++);
        }

        @Override public void deletePaymentNotice(long messageId) {
            if (explode) throw new IllegalStateException("bot is down");
            deleted.add(messageId);
        }
    }

    private AdminTelegramNotifier notifier(FakeBot bot, boolean enabled) {
        AdminTelegramNotifier n = new AdminTelegramNotifier(bot);
        ReflectionTestUtils.setField(n, "enabled", enabled);
        return n;
    }

    @Test
    void createdNoticeCarriesTheCardAmountsAndDeadline() {
        FakeBot bot = new FakeBot();

        OptionalLong id = notifier(bot, true).invoiceCreated(NOTICE);

        assertThat(id).hasValue(1L);
        assertThat(bot.posted).hasSize(1);
        String html = bot.posted.get(0);
        assertThat(html).contains("4556")
                .contains("ISMOILOV XUSNIDDIN")
                .contains("100 100")   // transfer amount, so'm
                .contains("100 000");  // credited amount, so'm
        assertThat(html).doesNotContain("8600");  // never a full PAN
    }

    /**
     * The Telegram group is outside our security boundary and its membership is
     * not the card-owner list. The full PAN's one permitted appearance in this
     * system is the invoice panel shown to the paying user.
     */
    @Test
    void neitherNoticeEverCarriesAFullPan() {
        FakeBot bot = new FakeBot();
        AdminTelegramNotifier n = notifier(bot, true);

        n.invoiceCreated(NOTICE);
        n.invoicePaid(NOTICE, null);

        assertThat(bot.posted).hasSize(2).allSatisfy(html -> {
            assertThat(html).contains("•••• 4556");
            assertThat(html.replaceAll("\\D", "")).doesNotContain("9860160101084556");
        });
    }

    @Test
    void paidNoticeDeletesTheOldMessageFirst() {
        FakeBot bot = new FakeBot();

        OptionalLong id = notifier(bot, true).invoicePaid(NOTICE, 77L);

        assertThat(bot.deleted).containsExactly(77L);
        assertThat(id).isPresent();
        assertThat(bot.posted.get(0)).contains("amalga oshirildi");
    }

    @Test
    void paidNoticeStillPostsWhenThereIsNoOldMessage() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).invoicePaid(NOTICE, null);

        assertThat(bot.deleted).isEmpty();
        assertThat(bot.posted).hasSize(1);
    }

    /** The property this whole task exists to preserve. */
    @Test
    void aDeadBotNeverThrowsAtTheCaller() {
        FakeBot bot = new FakeBot();
        bot.explode = true;
        AdminTelegramNotifier n = notifier(bot, true);

        assertThatCode(() -> {
            assertThat(n.invoiceCreated(NOTICE)).isEmpty();
            assertThat(n.invoicePaid(NOTICE, 5L)).isEmpty();
            n.invoiceExpired(5L);
        }).doesNotThrowAnyException();
    }

    @Test
    void disabledNotifierCallsNobody() {
        FakeBot bot = new FakeBot();

        AdminTelegramNotifier n = notifier(bot, false);
        assertThat(n.invoiceCreated(NOTICE)).isEmpty();
        n.invoiceExpired(9L);

        assertThat(bot.posted).isEmpty();
        assertThat(bot.deleted).isEmpty();
    }

    /**
     * The amounts are grouped for a human reader, and the grouping character
     * must not depend on the JVM's default locale — a build machine set to
     * de_DE would otherwise render "100.100" and quietly change the message.
     */
    @Test
    void amountsAreGroupedWithSpacesRegardlessOfTheDefaultLocale() {
        java.util.Locale previous = java.util.Locale.getDefault();
        try {
            java.util.Locale.setDefault(java.util.Locale.GERMANY);
            FakeBot bot = new FakeBot();

            notifier(bot, true).invoiceCreated(NOTICE);

            assertThat(bot.posted.get(0)).contains("100 100").doesNotContain("100.100");
        } finally {
            java.util.Locale.setDefault(previous);
        }
    }

    @Test
    void anUnmatchedCreditIsAnnouncedWithTheCardAndAmount() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).unmatchedCredit(new UnmatchedNotice(
                UUID.randomUUID(), "4962", 100_000L, Instant.parse("2026-08-14T04:38:00Z")));

        assertThat(bot.posted).hasSize(1);
        String html = bot.posted.get(0);
        assertThat(html).contains("4962").contains("1 000");
        assertThat(bot.deleted).as("an unmatched credit replaces nothing").isEmpty();
    }

    @Test
    void anUnmatchedAmountKeepsItsTiyinRemainder() {
        // An invoice amount is whole so'm by construction; a payment nobody
        // asked for is not. Printing 1 000,50 as "1 000" would make the notice
        // disagree with the bank statement the admin reads it against.
        FakeBot bot = new FakeBot();

        notifier(bot, true).unmatchedCredit(new UnmatchedNotice(
                UUID.randomUUID(), "4962", 100_050L, Instant.parse("2026-08-14T04:38:00Z")));

        assertThat(bot.posted.get(0)).contains("1 000,50");
    }

    @Test
    void anUnmatchedCreditNeverThrowsAtTheCaller() {
        FakeBot bot = new FakeBot();
        bot.explode = true;

        assertThatCode(() -> notifier(bot, true).unmatchedCredit(new UnmatchedNotice(
                UUID.randomUUID(), "4962", 100_000L, Instant.now())))
                .doesNotThrowAnyException();
    }
}
