package uz.efbazaar.marketplace.service;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.ChatMessage;
import static org.assertj.core.api.Assertions.assertThat;
class ChatCustomEmojiPreviewTest {
 @Test void previewUsesFallbackBeforeTruncation() {
  var message = ChatMessage.builder().content("Hello <tg-emoji emoji-id=\"123\">⚽</tg-emoji>!").build();
  assertThat(ChatService.previewOf(message)).isEqualTo("Hello ⚽!");
 }
 @Test void invalidIdRemainsPlainText() {
  var message = ChatMessage.builder().content("<tg-emoji emoji-id=\"invalid\">⚽</tg-emoji>").build();
  assertThat(ChatService.previewOf(message)).isEqualTo(message.getContent());
 }
}
