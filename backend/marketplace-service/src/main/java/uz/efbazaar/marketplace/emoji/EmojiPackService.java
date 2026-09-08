package uz.efbazaar.marketplace.emoji;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Admin qo'shgan Telegram emoji to'plamlari. */
@Service
@RequiredArgsConstructor
public class EmojiPackService {

    private final EmojiPackRepository packs;
    private final BotEmojiClient bot;

    @Transactional(readOnly = true)
    public List<EmojiPack> list() {
        return packs.findAllByOrderByAddedAtAsc();
    }

    @Transactional(readOnly = true)
    public EmojiPack get(UUID id) {
        EmojiPack pack = packs.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "To'plam topilmadi"));
        pack.getItems().size();   // lazy ro'yxatni tranzaksiya ichida ochamiz
        return pack;
    }

    /**
     * Havola bo'yicha to'plamni qo'shadi yoki mavjudini yangilaydi.
     *
     * <p>Ikkinchi marta qo'shish xato emas, YANGILASH: admin odatda paket
     * o'zgargani uchun qayta qo'yadi. "Allaqachon bor" deb rad etsak, u
     * o'chirib qayta qo'shishga majbur bo'lardi — natija bir xil, qadamlar
     * ko'p.
     */
    @Transactional
    public EmojiPack add(String link, UUID adminId) {
        // Tekshiruv Telegram'ga borishdan OLDIN: noto'g'ri havola uchun
        // tarmoqqa chiqish ham, kutish ham keraksiz.
        String setName = EmojiPackLink.setNameOf(link);

        TelegramEmojiSet fetched = bot.fetch(setName);
        if (fetched == null || fetched.items() == null || fetched.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "To'plamda custom emoji topilmadi: " + setName);
        }

        EmojiPack pack = packs.findBySetName(setName).orElse(null);
        boolean fresh = pack == null;
        if (fresh) {
            pack = EmojiPack.builder()
                    .id(UUID.randomUUID())
                    .setName(setName)
                    .addedBy(adminId)
                    .addedAt(Instant.now())
                    .items(new ArrayList<>())
                    .build();
        } else {
            pack.setRefreshedAt(Instant.now());
        }
        pack.setTitle(fetched.title() == null || fetched.title().isBlank()
                ? setName : fetched.title());

        replaceItems(pack, fetched);
        return packs.save(pack);
    }

    @Transactional
    public void delete(UUID id) {
        if (!packs.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "To'plam topilmadi");
        }
        packs.deleteById(id);
    }

    /**
     * Eski ro'yxatni butunlay almashtiradi.
     *
     * <p>Qo'shib qo'ymaymiz: to'plamdan olib tashlangan emoji bizda qolsa,
     * uning id'si Telegram'da yaroqsiz bo'ladi va matnga qo'yilganda xabar
     * umuman yuborilmaydi.
     */
    private static void replaceItems(EmojiPack pack, TelegramEmojiSet fetched) {
        pack.getItems().clear();
        int order = 0;
        for (TelegramEmojiSet.Item item : fetched.items()) {
            pack.getItems().add(EmojiPackItem.builder()
                    .id(UUID.randomUUID())
                    .pack(pack)
                    .customEmojiId(item.customEmojiId())
                    .emoji(item.emoji() == null ? "" : item.emoji())
                    .fileId(item.fileId())
                    .thumbnailFileId(item.thumbnailFileId())
                    .format(item.format())
                    .sortOrder(order++)
                    .build());
        }
    }
}
