package uz.efbazaar.bot.broadcast;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import uz.efbazaar.bot.broadcast.BroadcastRecipients.TelegramIdPage;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.SendOutcome;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Jo'natish natijalarini sanash sinovlari.
 *
 * <p>Bu yerdagi xato jimgina bo'ladi: adminka "hammasiga yuborildi" deb
 * ko'rsatadi, aslida yarmi yetmagan bo'ladi. Yuborilgan xabarni qaytarib
 * bo'lmagani uchun noto'g'ri hisobot noto'g'ri qarorga olib keladi.
 */
class BroadcastExecutorTest {

    private TelegramApiClient telegram;
    private BroadcastRecipients recipients;
    private BroadcastProgressReporter reporter;
    private BroadcastExecutor executor;

    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        recipients = mock(BroadcastRecipients.class);
        reporter = mock(BroadcastProgressReporter.class);
        // Sinovda kutib o'tirmaymiz: 1000 xabar/sek = 1 ms tanaffus.
        executor = new BroadcastExecutor(telegram, recipients, reporter,
                new BroadcastProperties(1000, 50));
    }

    private BroadcastJob job() {
        return new BroadcastJob(id, "salom", null, List.of(), BroadcastJob.Audience.ALL, List.of());
    }

    private BroadcastProgress lastProgress() {
        ArgumentCaptor<BroadcastProgress> captor = ArgumentCaptor.forClass(BroadcastProgress.class);
        verify(reporter, atLeastOnce()).report(eq(id), captor.capture());
        return captor.getValue();
    }

    private void runAndWait(BroadcastJob job) throws Exception {
        executor.submit(job);
        // Ijro bitta ipda ketadi; shutdown uni tugagunicha kutadi.
        executor.shutdownAndWait();
    }

    @Test
    @DisplayName("Uch xil natija alohida sanaladi")
    void countsOutcomesSeparately() throws Exception {
        when(recipients.fetch(any(), anyInt()))
                .thenReturn(new TelegramIdPage(List.of(1L, 2L, 3L, 4L), true, 4));
        when(telegram.sendBroadcast(eq("1"), anyString(), any(), any())).thenReturn(SendOutcome.sent());
        when(telegram.sendBroadcast(eq("2"), anyString(), any(), any())).thenReturn(SendOutcome.sent());
        when(telegram.sendBroadcast(eq("3"), anyString(), any(), any())).thenReturn(SendOutcome.blocked());
        when(telegram.sendBroadcast(eq("4"), anyString(), any(), any())).thenReturn(SendOutcome.failed("500"));

        runAndWait(job());

        BroadcastProgress last = lastProgress();
        assertThat(last.status()).isEqualTo(BroadcastProgress.Status.SENT);
        assertThat(last.sentCount()).isEqualTo(2);
        // Bloklangan — kutilgan holat; xatolik — tekshirishni talab qiladi.
        // Ularni qo'shib yuborsak nosozlik normal fonda ko'rinmay qolardi.
        assertThat(last.blockedCount()).isEqualTo(1);
        assertThat(last.failedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("429 dan keyin O'SHA foydalanuvchiga qayta urinadi")
    void retriesTheSameRecipientAfterRateLimit() throws Exception {
        when(recipients.fetch(any(), anyInt()))
                .thenReturn(new TelegramIdPage(List.of(7L), true, 1));
        when(telegram.sendBroadcast(eq("7"), anyString(), any(), any()))
                .thenReturn(SendOutcome.rateLimited(0))
                .thenReturn(SendOutcome.sent());

        runAndWait(job());

        // Qayta urinmasak chegaraga urilgan har bir odam xabarni
        // umuman olmasdi va buni hech narsa ko'rsatmasdi.
        verify(telegram, times(2)).sendBroadcast(eq("7"), anyString(), any(), any());
        assertThat(lastProgress().sentCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("SELECTED da auth-service'ga umuman borilmaydi")
    void selectedAudienceUsesTheProvidedList() throws Exception {
        when(telegram.sendBroadcast(anyString(), anyString(), any(), any()))
                .thenReturn(SendOutcome.sent());

        executor.submit(new BroadcastJob(id, "ogohlantirish", null, List.of(),
                BroadcastJob.Audience.SELECTED, List.of(11L, 22L)));
        executor.shutdownAndWait();

        // auth'dan ro'yxat so'rasak boshqa manzillar qaytardi va xabar
        // tanlanmagan odamlarga ketardi — qaytarib bo'lmaydigan xato.
        verify(recipients, never()).fetch(any(), anyInt());
        verify(telegram).sendBroadcast(eq("11"), anyString(), any(), any());
        verify(telegram).sendBroadcast(eq("22"), anyString(), any(), any());
        assertThat(lastProgress().sentCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("Manzillar ro'yxati olinmasa FAILED deb belgilanadi")
    void marksFailedWhenRecipientsCannotBeFetched() throws Exception {
        when(recipients.fetch(any(), anyInt())).thenReturn(null);

        runAndWait(job());

        // Bo'sh ro'yxat va nosozlik farqlanishi shart. Aks holda auth
        // yiqilganda jo'natish "muvaffaqiyatli, 0 kishiga" bo'lib yakunlanardi.
        BroadcastProgress last = lastProgress();
        assertThat(last.status()).isEqualTo(BroadcastProgress.Status.FAILED);
        assertThat(last.errorMessage()).isNotBlank();
    }

    @Test
    @DisplayName("Barcha sahifalar aylanib chiqiladi")
    void walksEveryPage() throws Exception {
        when(recipients.fetch(any(), eq(0)))
                .thenReturn(new TelegramIdPage(List.of(1L, 2L), false, 3));
        when(recipients.fetch(any(), eq(1)))
                .thenReturn(new TelegramIdPage(List.of(3L), true, 3));
        when(telegram.sendBroadcast(anyString(), anyString(), any(), any()))
                .thenReturn(SendOutcome.sent());

        runAndWait(job());

        assertThat(lastProgress().sentCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("Auditoriya auth-service'ga uzatiladi")
    void passesAudienceThrough() throws Exception {
        when(recipients.fetch(any(), anyInt()))
                .thenReturn(new TelegramIdPage(List.of(), true, 0));

        executor.submit(new BroadcastJob(
                id, "salom", null, List.of(), BroadcastJob.Audience.ADMINS, List.of()));
        executor.shutdownAndWait();

        // Sinov rejimi ishlamasa xabar ADMINS tanlanganda ham hammaga
        // ketardi — va uni qaytarib bo'lmasdi.
        verify(recipients).fetch(eq(BroadcastJob.Audience.ADMINS), eq(0));
    }
}
