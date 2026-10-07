package uz.efbazaar.marketplace.emoji;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.UUID;
/** Read-only catalog for authenticated chat users. Management stays under /admin. */
@RestController
@RequestMapping("/api/v1/emoji-packs")
@RequiredArgsConstructor
public class ChatEmojiPackController {
 private final EmojiPackService service;
 @GetMapping public List<EmojiPackDtos.PackSummary> list() { return service.list(); }
 @GetMapping("/{id}") public EmojiPackDtos.PackDetail get(@PathVariable UUID id) { return service.get(id); }
}
