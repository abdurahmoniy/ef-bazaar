package uz.efbazaar.marketplace.emoji;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Emoji to'plamlari haqiqiy Postgres ustida.
 *
 * <p>NEGA HAQIQIY BAZA. Bu yerdagi uch narsa mock bilan umuman
 * sinalmaydi: `summaries()` dagi JPQL to'g'rimi (noto'g'ri so'rov faqat
 * kontekst ko'tarilganda yiqiladi), `size(p.items)` haqiqatan sanash
 * so'roviga aylanadimi, va to'plam o'chganda ichidagilar ketadimi —
 * bu FK dagi ON DELETE CASCADE da yashaydi, kodda emas.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Dispose the Spring context while its class-owned database is still running.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(EmojiPackSchemaIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class EmojiPackSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired TestEntityManager em;
    @Autowired EmojiPackRepository packs;

    private EmojiPack pack(String setName, int items) {
        EmojiPack p = EmojiPack.builder()
                .id(UUID.randomUUID()).setName(setName).title(setName + " title")
                .addedAt(Instant.now()).items(new ArrayList<>())
                .build();
        for (int i = 0; i < items; i++) {
            p.getItems().add(EmojiPackItem.builder()
                    .id(UUID.randomUUID()).pack(p)
                    .customEmojiId(setName + "-" + i).emoji("🙂")
                    .fileId("f" + i).thumbnailFileId("t" + i)
                    .format("video").sortOrder(i)
                    .build());
        }
        return p;
    }

    @Test
    @DisplayName("ro'yxat emoji sonini beradi")
    void summariesCarryTheCount() {
        packs.save(pack("Alpha", 3));
        packs.save(pack("Beta", 1));
        em.flush();
        em.clear();

        var summaries = packs.summaries();

        assertThat(summaries).extracting(EmojiPackRepository.SummaryView::getSetName)
                .containsExactly("Alpha", "Beta");
        assertThat(summaries).extracting(EmojiPackRepository.SummaryView::getItemCount)
                .containsExactly(3, 1);
    }

    @Test
    @DisplayName("bitta to'plam emoji'lari bilan Telegram tartibida keladi")
    void detailKeepsTelegramOrder() {
        EmojiPack saved = packs.save(pack("Gamma", 3));
        em.flush();
        em.clear();

        var found = packs.findWithItemsById(saved.getId()).orElseThrow();

        assertThat(found.getItems()).extracting(EmojiPackItem::getSortOrder)
                .containsExactly(0, 1, 2);
    }

    @Test
    @DisplayName("bir to'plam ikki marta qo'shilmaydi")
    void setNameIsUnique() {
        packs.saveAndFlush(pack("Delta", 1));

        assertThatThrownBy(() -> packs.saveAndFlush(pack("Delta", 1)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("to'plam o'chsa ichidagi emoji'lar ham ketadi")
    void deletingAPackTakesItsItems() {
        EmojiPack saved = packs.save(pack("Epsilon", 2));
        em.flush();

        packs.delete(saved);
        em.flush();
        em.clear();

        // Qolib ketsa ular hech kimga tegishli bo'lmagan qator bo'lardi va
        // keyingi importda unique indeksni to'sib qo'yardi.
        Long left = (Long) em.getEntityManager()
                .createQuery("select count(i) from EmojiPackItem i")
                .getSingleResult();
        assertThat(left).isZero();
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(
            basePackageClasses = EmojiPack.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = EmojiPack.class,
            considerNestedRepositories = true)
    static class Config {}
}
