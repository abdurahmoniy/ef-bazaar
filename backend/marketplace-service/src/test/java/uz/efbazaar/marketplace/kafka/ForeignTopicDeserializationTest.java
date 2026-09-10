package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.annotation.KafkaListener;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Begona topikni o'qiydigan har bir listener `use.type.headers=false`
 * qo'yishi SHART.
 *
 * <p>Boshqa servislar Spring `JsonSerializer` bilan yuboradi va u xabarga
 * `__TypeId__` sarlavhasini qo'yadi — ichida O'Z klassining nomi. Bizda u
 * klass yo'q va bo'lishi ham shart emas: DTO'lar ataylab mahalliy
 * nusxalar, servislar mustaqil deploy bo'lishi uchun.
 *
 * <p>Sarlavha e'tiborga olinsa, xato `poll()` ICHIDA yuz beradi va uni
 * hech qanday error handler ushlay olmaydi: offset commit qilinmaydi va
 * konteyner o'sha xabarni cheksiz qayta o'qiydi. 2026-09-09 da
 * trade-service shu sababli ikki yadroni yoqdi; support javoblari esa
 * saytga umuman yetib bormasdi.
 *
 * <p>Bu test qoidani MAJBURIY qiladi. Yangi listener qo'shgan odam uni
 * unutsa, o'sha zahoti biladi — produksiyada, jimgina emas.
 */
class ForeignTopicDeserializationTest {

    private static final Path SOURCES = Path.of("src/main/java/uz/efbazaar/marketplace");

    @Test
    @DisplayName("har bir @KafkaListener type sarlavhasini e'tiborsiz qoldiradi")
    void everyListenerIgnoresTypeHeaders() throws Exception {
        List<String> offenders = new ArrayList<>();

        try (Stream<Path> files = Files.walk(SOURCES)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file);
                long listeners = source.lines().filter(l -> l.contains("@KafkaListener")).count();
                if (listeners == 0) continue;
                long flags = source.lines()
                        .filter(l -> l.contains("spring.json.use.type.headers=false")).count();
                if (flags < listeners) {
                    offenders.add(file.getFileName() + " (listener=" + listeners
                            + ", flag=" + flags + ")");
                }
            }
        }

        assertThat(offenders)
                .as("Bu fayllardagi listenerlar `__TypeId__` sarlavhasiga ishonadi va "
                        + "boshqa servisdan kelgan xabarda ClassNotFoundException bilan "
                        + "cheksiz halqaga tushadi")
                .isEmpty();
    }
}
