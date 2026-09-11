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

    /**
     * Fixed ids, not random ones. The notice prints the user id, and the
     * assertions below check that digit sequences from a card number are
     * absent — a random UUID's hex can contain any four digits, so
     * {@code UUID.randomUUID()} here failed the "8600" check on CI roughly
     * once every few hundred runs, on a build that had changed nothing.
     *
     * <p>These two contain no run of digits that any assertion in this file
     * looks for.
     */
    private static final UUID INVOICE_ID =
            UUID.fromString("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");
    private static final UUID USER_ID =
            UUID.fromString("bbbbbbbb-2222-4222-9222-bbbbbbbbbbbb");

    private static final InvoiceNotice NOTICE = new InvoiceNotice(
            INVOICE_ID, USER_ID, "4556", "ISMOILOV XUSNIDDIN",
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
    // --- card debits -------------------------------------------------------

    private static final DebitNotice DEBIT = new DebitNotice(
            UUID.randomUUID(), "4962", 1_000_000L, 0L, 4_400_000L,
            "Openbank P2P HUMO OT", Instant.parse("2026-09-10T20:34:00Z"));

    @Test
    void aDebitNoticeCarriesTheCardTheAmountTheTimeAndTheBalance() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(DEBIT);

        assertThat(bot.posted).hasSize(1);
        String html = bot.posted.get(0);
        assertThat(html).contains("Kartadan pul yechildi");
        assertThat(html).contains("•••• 4962");
        assertThat(html).contains("10 000 so'm");
        assertThat(html).contains("Openbank P2P HUMO OT");
        // Asia/Tashkent is UTC+5, so 20:34Z reads as 01:34 the next day —
        // the same clock the bank's own notice printed.
        assertThat(html).contains("01:34");
        assertThat(html).contains("44 000 so'm");
    }

    /** The masked tail only, wherever the notice goes. */
    @Test
    void aDebitNoticeNeverCarriesMoreThanTheMaskedTail() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(DEBIT);

        String html = bot.posted.get(0);
        assertThat(html).contains("•••• 4962");
        // Amounts are grouped with spaces and the clock with a colon, so the
        // longest legitimate run of digits on this notice is four. A card
        // number is twelve or more — this is the assertion that fails if a
        // future edit ever puts one here.
        assertThat(html).doesNotContainPattern("\\d{12}");
    }

    /**
     * A commission of zero is stated by the bank on some notices and omitted on
     * others. Printing "Komissiya: 0" every time is noise in a topic an admin
     * scans on a phone.
     */
    @Test
    void aZeroCommissionIsNotPrinted() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(DEBIT);

        assertThat(bot.posted.get(0)).doesNotContain("Komissiya");
    }

    @Test
    void aRealCommissionIsPrinted() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(new DebitNotice(
                UUID.randomUUID(), "4962", 1_000_000L, 50_000L, 4_400_000L,
                null, Instant.parse("2026-09-10T20:34:00Z")));

        assertThat(bot.posted.get(0)).contains("Komissiya: 500 so'm");
    }

    /**
     * The bank omits these lines on some notices. An empty "📍" or a
     * "Qoldiq: —" is worse than no line at all.
     */
    @Test
    void theOptionalLinesAreOmittedRatherThanPrintedEmpty() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(new DebitNotice(
                UUID.randomUUID(), "7272", 402_000L, null, null,
                null, Instant.parse("2026-09-10T20:43:00Z")));

        String html = bot.posted.get(0);
        assertThat(html).doesNotContain("📍");
        assertThat(html).doesNotContain("Qoldiq");
        assertThat(html).contains("4 020 so'm");
    }

    /** Free text from the bank goes through HTML — it must not be able to break it. */
    @Test
    void aDescriptionCarryingMarkupIsEscaped() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).cardDebited(new DebitNotice(
                UUID.randomUUID(), "4962", 1_000L, null, null,
                "<b>P2P</b> & co", Instant.parse("2026-09-10T20:34:00Z")));

        assertThat(bot.posted.get(0)).contains("&lt;b&gt;P2P&lt;/b&gt; &amp; co");
    }

    /** A Telegram outage must never propagate into the ingest path. */
    @Test
    void aDeadBotDoesNotThrowOutOfTheDebitNotice() {
        FakeBot bot = new FakeBot();
        bot.explode = true;

        assertThatCode(() -> notifier(bot, true).cardDebited(DEBIT)).doesNotThrowAnyException();
    }

    @Test
    void aDisabledNotifierSendsNoDebitNotice() {
        FakeBot bot = new FakeBot();

        notifier(bot, false).cardDebited(DEBIT);

        assertThat(bot.posted).isEmpty();
    }
}
