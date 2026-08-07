package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatStatus;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatTradePinRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the concurrent-trade scenario that motivated {@code chat_trade_pins}
 * (V28) against a real Postgres: a chat can host more than one trade over its
 * life ({@code idx_trades_chat_id} in trade-service is non-unique), so a
 * single absolute {@code system_important} flag would let the first trade to
 * close unpin a chat a second trade is still using. This also proves the
 * upsert's last-write-wins guard makes an out-of-order/redelivered event
 * self-correcting instead of sticking the pin open forever.
 *
 * <p>Requires Docker on the host. Skipped automatically when Testcontainers
 * cannot start a container (e.g. no Docker socket).
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(TradeChatPinConsumerIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class TradeChatPinConsumerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ChatRepository chats;
    @Autowired ChatTradePinRepository pins;

    private TradeChatPinConsumer consumer;
    private UUID chatId;

    @BeforeEach
    void setUp() {
        consumer = new TradeChatPinConsumer(chats, pins);
        Chat chat = chats.save(Chat.builder()
                .listingId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .status(ChatStatus.ACTIVE)
                .lastMessageAt(Instant.now())
                .build());
        chatId = chat.getId();
    }

    @Test
    void secondTradeKeepsChatPinnedAfterFirstCloses() {
        UUID tradeA = UUID.randomUUID();
        UUID tradeB = UUID.randomUUID();
        Instant t0 = Instant.now();

        consumer.onOpened(new TradeChatPinDto(tradeA, chatId, t0));
        consumer.onOpened(new TradeChatPinDto(tradeB, chatId, t0.plusSeconds(1)));
        consumer.onClosed(new TradeChatPinDto(tradeA, chatId, t0.plusSeconds(2)));

        assertThat(chats.findById(chatId).orElseThrow().isSystemImportant()).isTrue();
    }

    @Test
    void chatUnpinsOnceTheLastTradeCloses() {
        UUID tradeA = UUID.randomUUID();
        Instant t0 = Instant.now();

        consumer.onOpened(new TradeChatPinDto(tradeA, chatId, t0));
        consumer.onClosed(new TradeChatPinDto(tradeA, chatId, t0.plusSeconds(1)));

        assertThat(chats.findById(chatId).orElseThrow().isSystemImportant()).isFalse();
    }

    @Test
    void outOfOrderRedeliveryDoesNotStickThePinOpen() {
        UUID tradeA = UUID.randomUUID();
        Instant opened = Instant.now();
        Instant closed = opened.plusSeconds(5);

        // trade-closed lands first (e.g. consumer lag on the trade-opened
        // partition), then the older-by-timestamp trade-opened is redelivered.
        consumer.onClosed(new TradeChatPinDto(tradeA, chatId, closed));
        consumer.onOpened(new TradeChatPinDto(tradeA, chatId, opened));

        assertThat(chats.findById(chatId).orElseThrow().isSystemImportant()).isFalse();
    }

    /** Minimal config that pulls only the repositories under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
