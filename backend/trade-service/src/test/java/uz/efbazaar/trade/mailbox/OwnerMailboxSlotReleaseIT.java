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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class OwnerMailboxSlotReleaseIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;
    @Autowired uz.efbazaar.trade.trade.repository.TradeRepository trades;

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

    /**
     * Foydalanuvchida pochta serveridan o'chirish yo'li YO'Q.
     *
     * <p>Slotni bo'shatish uchun uzish bor ({@code POST /{id}/detach}) va u
     * yetarli. O'chirish esa adminda qoladi: quti Konami parol tiklash
     * xatlarini saqlaydi va nizo chiqqanda tekshiriladigan yagona iz o'sha
     * — bir bosish bilan yo'q qilinsa, orqaga yo'l qolmaydi.
     */
    @Test
    void theOwnerHasNoWayToDestroyTheMailbox() throws Exception {
        UUID id = mailbox(owner, null);

        mvc.perform(delete(path(id)).with(asUser(owner)))
                .andExpect(status().isMethodNotAllowed());

        Mailbox after = mailboxes.findById(id).orElseThrow();
        assertThat(after.getDeletedAt()).isNull();
        assertThat(after.getOwnerUserId()).isEqualTo(owner);
    }

    @Test
    void theOwnerFreesTheSlotByDetaching() throws Exception {
        UUID id = mailbox(owner, null);

        mvc.perform(post(path(id) + "/detach").with(asUser(owner)))
                .andExpect(status().isNoContent());

        Mailbox after = mailboxes.findById(id).orElseThrow();
        // Egalik olib tashlanadi — slot aynan shundan bo'shaydi.
        assertThat(after.getOwnerUserId()).isNull();
        // Quti esa joyida: uni olib tashlash admin ishi.
        assertThat(after.getDeletedAt()).isNull();
    }

    @Test
    void somebodyElsesMailboxIsNotFound() throws Exception {
        // 404, 403 emas: begonaga bu quti BORLIGINI ham aytmaymiz.
        UUID id = mailbox(owner, null);

        mvc.perform(post(path(id) + "/detach").with(asUser(UUID.randomUUID())))
                .andExpect(status().isNotFound());

        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void aMailboxInALiveTradeIsRefused() throws Exception {
        // U hozir ishlatilmoqda; olib qo'yish savdoni to'xtatib qo'yardi.
        // Tirik savdo TRADES jadvalidan aniqlanadi: o'rin band qilingan
        // qutida `mailboxes.trade_id` umuman to'ldirilmaydi.
        UUID id = mailbox(owner, null);
        trades.saveAndFlush(uz.efbazaar.trade.trade.domain.Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(owner)
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(uz.efbazaar.trade.trade.domain.TradeState.WAITING_EMAIL_CHANGE)
                .mailboxId(id)
                .mode(uz.efbazaar.trade.trade.domain.TradeMode.SMART)
                .expiresAt(java.time.Instant.now().plus(java.time.Duration.ofDays(7)))
                .build());

        mvc.perform(post(path(id) + "/detach").with(asUser(owner)))
                .andExpect(status().isConflict());

        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }
}
