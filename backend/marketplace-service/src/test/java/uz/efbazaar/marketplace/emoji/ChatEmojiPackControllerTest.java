package uz.efbazaar.marketplace.emoji;
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
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest({AdminEmojiPackController.class, ChatEmojiPackController.class})
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class ChatEmojiPackControllerTest {
 @Autowired MockMvc mvc;
 @MockBean EmojiPackService service;
 final UUID user = UUID.randomUUID();
 @Test void authenticatedUserCanReadPacks() throws Exception {
  when(service.list()).thenReturn(List.of());
  mvc.perform(get("/api/v1/emoji-packs").header("X-User-Id", user)).andExpect(status().isOk()).andExpect(content().json("[]"));
  verify(service).list();
 }
 @Test void authenticatedUserCanReadDetailsAndMissingPackReturns404() throws Exception {
  UUID id = UUID.randomUUID();
  when(service.get(id)).thenReturn(new EmojiPackDtos.PackDetail(id, "Football", "Football", List.of()));
  mvc.perform(get("/api/v1/emoji-packs/" + id).header("X-User-Id", user)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
  when(service.get(id)).thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
  mvc.perform(get("/api/v1/emoji-packs/" + id).header("X-User-Id", user)).andExpect(status().isNotFound());
 }
 @Test void anonymousCannotReadAndUserCannotManagePacks() throws Exception {
  mvc.perform(get("/api/v1/emoji-packs")).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/emoji-packs").header("X-User-Id", user)).andExpect(status().isForbidden());
  mvc.perform(delete("/api/v1/admin/emoji-packs/" + UUID.randomUUID()).header("X-User-Id", user)).andExpect(status().isForbidden());
  verifyNoInteractions(service);
 }
}
