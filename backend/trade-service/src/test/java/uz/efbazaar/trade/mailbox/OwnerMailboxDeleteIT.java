package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * Foydalanuvchi O'Z pochta qutisini o'chiradi.
 *
 * <p>Slot to'lganda savdoga kira olmaydi va yagona chiqish yo'li —
 * eskisini bo'shatish. Ilgari o'chirish faqat adminda edi va admin ham
 * egasi bor qutini o'chira olmasdi: to'lgan slot boshi berk ko'cha
 * bo'lardi va foydalanuvchi buni bilmasdi ham.
 *
 * <p>Rad etishlar o'chirishdan muhimroq: begonaning qutisi Konami
 * parol tiklash xatlarini saqlaydi.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OwnerMailboxDeleteIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;

    private final UUID owner = UUID.randomUUID();

    private UUID mailbox(UUID ownerId, UUID tradeId) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder()
                .id(id)
                .email("owner-cleanup-" + id + "@efbazaar.uz")
                .ownerUserId(ownerId)
                .tradeId(tradeId)
                .encryptedPassword(new byte[]{1})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(Instant.now())
                .provisionedAt(Instant.now())
                .build());
        return id;
    }

    private String path(UUID id) {
        return "/api/v1/mailboxes/" + id;
    }

    @Test
    void theOwnerCanFreeTheirOwnSlot() throws Exception {
        UUID id = mailbox(owner, null);

        mvc.perform(delete(path(id)).with(asUser(owner))).andExpect(status().isNoContent());

        Mailbox after = mailboxes.findById(id).orElseThrow();
        assertThat(after.getDeletedAt())
                .as("slot bo'shashi uchun o'chirilgan deb belgilanishi shart")
                .isNotNull();
        // Egalik ham olib tashlanadi: sanoq uni hali ham egalik
        // qilingan deb hisoblasa, slot bo'shamasdi.
        assertThat(after.getOwnerUserId()).isNull();
    }

    @Test
    void somebodyElsesMailboxIsNotFound() throws Exception {
        // 404, 403 emas: begonaga bu quti BORLIGINI ham aytmaymiz.
        UUID id = mailbox(owner, null);

        mvc.perform(delete(path(id)).with(asUser(UUID.randomUUID())))
                .andExpect(status().isNotFound());

        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void aMailboxInALiveTradeIsRefused() throws Exception {
        // U hozir ishlatilmoqda; olib qo'yish savdoni to'xtatib qo'yardi.
        UUID id = mailbox(owner, UUID.randomUUID());

        mvc.perform(delete(path(id)).with(asUser(owner)))
                .andExpect(status().isConflict());

        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }
}
