package uz.efbazaar.bot.guide;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GuideMessengerTest {

    private final TelegramApiClient telegram = mock(TelegramApiClient.class);
    private final GuideClient guides = mock(GuideClient.class);
    private final GuideMessenger messenger = new GuideMessenger(telegram, guides);
    private final ObjectMapper mapper = new ObjectMapper();

    private static final UUID GUIDE = UUID.randomUUID();

    private void sendingSucceeds() {
        when(telegram.sendVideoByFileId(anyString(), anyString(), anyString(), any()))
                .thenReturn(java.util.Optional.of(1));
        when(telegram.sendDocumentByFileId(anyString(), anyString(), anyString(), any()))
                .thenReturn(java.util.Optional.of(1));
    }

    private GuideClient.GuideButtonView button() {
        return new GuideClient.GuideButtonView(GUIDE, "E'lon joylash", "Tavsif", "FILE123", "VIDEO");
    }

    @Test
    @DisplayName("qo'llanma bo'lmasa ro'yxat xabari umuman yuborilmaydi")
    void noGuidesMeansNoMessage() {
        // Bo'sh "qo'llanmalar" xabari har /start da chiqib, hech narsa
        // bermasdi — foydalanuvchi uni shovqin deb bilardi.
        when(guides.buttons()).thenReturn(List.of());

        messenger.sendList(42L);

        verify(telegram, never()).sendMessageWithCallbacks(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("har qo'llanma alohida qatorda chiqadi")
    void eachGuideGetsItsOwnRow() {
        var second = new GuideClient.GuideButtonView(UUID.randomUUID(), "Savdo", "T", "F2", "VIDEO");
        when(guides.buttons()).thenReturn(List.of(button(), second));

        messenger.sendList(42L);

        var rows = GuideMessenger.keyboardOf(List.of(button(), second));
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst()).singleElement()
                .extracting(TelegramApiClient.CallbackButton::text)
                .isEqualTo("E'lon joylash");
        verify(telegram).sendMessageWithCallbacks(eq("42"), anyString(), any());
    }

    @Test
    @DisplayName("tugma bosilganda eski xabar o'chib, video keladi")
    void pressingBringsTheVideoAndRemovesTheList() throws Exception {
        sendingSucceeds();
        sendingSucceeds();
        when(guides.buttons()).thenReturn(List.of(button()));
        var query = mapper.readTree("""
                {"id":"cb1","data":"guide:%s",
                 "message":{"message_id":77,"chat":{"id":42}}}""".formatted(GUIDE));

        messenger.onCallback(query);

        // Tasdiq birinchi: usiz tugmada aylanuvchi belgi osilib turadi.
        verify(telegram).answerCallbackQuery("cb1");
        verify(telegram).deleteMessage("42", 77L);
        verify(telegram).sendVideoByFileId(eq("42"), eq("FILE123"), eq("Tavsif"), any());
    }

    @Test
    @DisplayName("video xabarida tugmalar saqlanadi")
    void theVideoKeepsTheButtons() throws Exception {
        // Aks holda bitta qo'llanmani ko'rgan foydalanuvchi boshqasiga
        // o'ta olmay, /start ni qayta bosishga majbur bo'lardi.
        when(guides.buttons()).thenReturn(List.of(button()));
        var query = mapper.readTree("""
                {"id":"cb1","data":"guide:%s",
                 "message":{"message_id":77,"chat":{"id":42}}}""".formatted(GUIDE));

        messenger.onCallback(query);

        var captor = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(telegram).sendVideoByFileId(anyString(), anyString(), anyString(), captor.capture());
        assertThat(captor.getValue()).isNotEmpty();
    }

    @Test
    @DisplayName("o'chirilgan qo'llanma tugmasi hech narsa yubormaydi")
    void aDeletedGuideSendsNothing() {
        // Tugma keshda qolgan eski xabarda bosilishi mumkin. Video
        // yubormaymiz, lekin tasdiqni baribir beramiz.
        when(guides.buttons()).thenReturn(List.of());
        var query = mapper.createObjectNode();
        query.put("id", "cb1");
        query.put("data", "guide:" + UUID.randomUUID());

        messenger.onCallback(query);

        verify(telegram).answerCallbackQuery("cb1");
        verify(telegram, never()).sendVideoByFileId(anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("MP4 bo'lmagan qo'llanma document sifatida yuboriladi")
    void aDocumentGuideGoesAsDocument() {
        // Telegram MP4 bo'lmagan faylni document sifatida qabul qiladi va
        // o'sha `file_id` ni sendVideo ga bersak RAD ETADI. Turni
        // saqlamaganimizda qo'llanma bosilganda hech narsa kelmasdi.
        sendingSucceeds();
        when(guides.buttons()).thenReturn(List.of(
                new GuideClient.GuideButtonView(GUIDE, "Q", "Tavsif", "FILE123", "DOCUMENT")));
        var query = query();

        messenger.onCallback(query);

        verify(telegram).sendDocumentByFileId(eq("42"), eq("FILE123"), eq("Tavsif"), any());
        verify(telegram, never()).sendVideoByFileId(anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("yuborish yiqilsa ro'yxat o'chirilmaydi")
    void aFailedSendKeepsTheList() {
        // Aks holda foydalanuvchi qo'lida hech narsa qolmaydi: ro'yxat ham
        // yo'q, video ham yo'q, sabab ham ko'rinmaydi.
        when(telegram.sendVideoByFileId(anyString(), anyString(), anyString(), any()))
                .thenReturn(java.util.Optional.empty());
        when(guides.buttons()).thenReturn(List.of(button()));

        messenger.onCallback(query());

        verify(telegram, never()).deleteMessage(anyString(), anyLong());
    }

    @Test
    @DisplayName("sendGuide mavjud qo'llanmani muvaffaqiyatli yuboradi")
    void sendGuideSendsVideo() {
        sendingSucceeds();
        when(guides.buttons()).thenReturn(List.of(button()));

        boolean result = messenger.sendGuide(42L, GUIDE);

        assertThat(result).isTrue();
        verify(telegram).sendVideoByFileId(eq("42"), eq("FILE123"), eq("Tavsif"), any());
    }

    @Test
    @DisplayName("sendGuide mavjud bo'lmagan qo'llanma uchun false qaytaradi")
    void sendGuideReturnsFalseWhenNotFound() {
        when(guides.buttons()).thenReturn(List.of());

        boolean result = messenger.sendGuide(42L, UUID.randomUUID());

        assertThat(result).isFalse();
        verify(telegram, never()).sendVideoByFileId(anyString(), anyString(), anyString(), any());
    }

    private com.fasterxml.jackson.databind.JsonNode query() {
        try {
            return mapper.readTree("""
                    {"id":"cb1","data":"guide:%s",
                     "message":{"message_id":77,"chat":{"id":42}}}""".formatted(GUIDE));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
