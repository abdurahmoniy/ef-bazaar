# Partner Channel Advertising Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller pays a partner to post their listing in that partner's Telegram channel, the bot delivers it, and the partner earns the posting fee plus a share of the trades that post produces — all visible in a partner panel and an admin dashboard.

**Architecture:** marketplace-service owns channels, orders and posts. payment-service moves the money with the hold/settle shape it already uses for trade escrow. trade-service stamps the attributed partner on the trade at open and passes it to settle. The bot delivers posts and reports back.

**Tech Stack:** Java 21, Spring Boot 3.3.4, PostgreSQL 16 + Flyway, Kafka, Next.js 16 + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-partners-and-referrals-design.md` (§3.1 `partner_channels` onward, §4.1–4.3, §6, §7.1, §7.3, §7.5)

**Phase 1 (referrals) is already built and merged.** This plan reuses its link codes, its click capture and `ReferralCodeService.resolve`.

## Global Constraints

- **Flyway `V<n>__*.sql` files are immutable once merged.** Next free: marketplace-service **V43** then **V44**, payment-service **V11**, trade-service **V23**. Re-check with `ls db/migration | sort -V | tail -1` **after every rebase** — `main` took V41 out from under this branch once already, and Flyway refuses to start on a duplicate version. Also `rm` the stale file from `target/classes/db/migration/` after any rename.
- **Testcontainers tests need `-DargLine="-Dapi.version=1.44"`.** Without it docker-java negotiates API 1.32, the local Docker 29.x daemon refuses, and Testcontainers reports it as the misleading "Could not find a valid Docker environment". Command line only — never in a pom.
- **Java build:** `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test` from the service directory. Ambient JDK 25 fails on Lombok.
- **Run several tests with commas, not plus:** `-Dtest='A,B'`. `-Dtest='A+B'` matches nothing, and with `-q` that looks exactly like success.
- **Frontend:** `npm test` (vitest), `npm run lint`, and `npm run build` from `frontend/`. The build is not optional — this project is on Next.js 16 where `middleware.ts` is `proxy.ts`, and only the build catches that class of mistake.
- **`sellerId`/`userId` never comes from a request body** — only `@AuthenticationPrincipal AuthenticatedUser user` → `user.userId()`.
- **Services never touch another service's database.** Cross-service reads go over `/internal` HTTP or Kafka.
- **Kafka events published inside `@Transactional` must fire after commit** — `TradeEventPublisher.send` is the reference.
- **Money is `long` tiyin in payment-service, `BigDecimal` so'm in marketplace-service.** 1 so'm = 100 tiyin, converted at the client boundary as `PartnerFeeClient` does.
- **Ledger sign convention:** negative is a credit, positive is a debit, every transaction's postings sum to zero.
- **No "Generated with Claude" or `Co-Authored-By: Claude` anywhere.**
- **Never stage `smart-admin-worker/tests/fixtures/crypto_vectors.json`** or `backend/marketplace-service/src/main/resources/application.yml` — both carry unrelated local changes.
- **Nested `@Repository` interfaces are supported** (`NestedJpaRepositoriesConfig`). Follow the `ReferralRepositories` holder pattern — and add every new repository to `MarketplaceApplicationTests`, which mocks them by hand and fails the whole context if one is missing.
- **UI copy is Uzbek.** Match the partner and referral screens.

---

## File Structure

**marketplace-service** — the `partner` package grows; advertising gets its own:

| File | Responsibility |
|---|---|
| `db/migration/V43__partner_channels_and_posts.sql` | Channels, orders, posts, payout policy |
| `partner/PartnerChannel.java` | The advertising surface: price, subscribers, payout override |
| `partner/ads/ListingChannelPost.java` | One ordered post and its state |
| `partner/ads/PartnerAdRepositories.java` | Holder with the nested repositories |
| `partner/ads/PartnerPricing.java` | `priceFor(channel, listing)` — the single seam tiers land in |
| `partner/ads/ChannelPostService.java` | Ordering, holding, settling, refunding |
| `partner/ads/ChannelDirectoryService.java` | The picker's search and ranking |
| `partner/ads/PartnerPayoutPolicy.java` | Global default + per-channel override resolution |
| `partner/ads/PartnerMonthlyPayoutJob.java` | The 1st-of-month fixed payment |
| `partner/ads/PartnerAdClient.java` | marketplace → payment for hold/settle/refund/monthly |
| `partner/ads/PartnerAdDtos.java` | Request/response records |
| `partner/ads/ChannelDirectoryController.java` | `/api/v1/partners/channels` — the picker |
| `partner/ads/PartnerPanelController.java` | `/api/v1/partners/panel` — the owner's own view |
| `db/migration/V44__partner_click_attribution.sql` | Clicks and listing attribution |
| `partner/ads/ListingAttributionService.java` | Which channel sent this buyer to this listing |

**payment-service:** `wallet/domain/TransactionKind.java`, new `partnerads` package with `PartnerAdLedgerService` and `InternalPartnerAdController`; `wallet/service/TradeEscrowService.java` and `wallet/controller/InternalTradeEscrowController.java` for the trade share.

**trade-service:** `db/migration/V23__trade_partner_attribution.sql`, `trade/domain/Trade.java`, `trade/service/TradeService.java` (stamp at open), `payment/EscrowClient.java` (pass the share).

**bot:** `partner/ChannelPoster.java` and a Kafka consumer for `efbazaar.marketplace.channel-post-requested`.

**frontend:** `src/lib/partner-channels.ts`, `src/components/marketplace/channel-picker.tsx`, `src/components/partners/partner-panel/*`, `src/components/admin/admin-partner-analytics.tsx`.

---

### Task 1: Channels, orders and posts

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V43__partner_channels_and_posts.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/partner/PartnerChannel.java`
- Create: `.../partner/ads/ListingChannelPost.java`
- Create: `.../partner/ads/PartnerAdRepositories.java`
- Modify: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/MarketplaceApplicationTests.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/partner/ads/PartnerAdSchemaIT.java`

**Interfaces:**
- Produces: `PartnerChannel`, `ListingChannelPost` with `enum State { AWAITING_FUNDS, HELD, POSTED, FAILED, REFUNDED }`, and `PartnerAdRepositories.{PartnerChannelRepository, ListingChannelPostRepository}`.

- [ ] **Step 1: Write the migration**

```sql
-- Hamkorlik reklama bozori: kanal, buyurtma, post.

-- Tasdiqlangan hamkorlikning reklama yuzasi.
--
-- ATAYLAB partner_applications DAN AJRATILGAN. Ariza — qabul qilingan
-- qarorning o'zgarmas yozuvi; kanal esa hamkorlik davomida o'zgarib
-- turadigan sozlamalarni olib yuradi (narx, obunachi soni, to'lov
-- rejimi). Ikkalasini bitta qatorga qo'shsak, arizaning tarixiy
-- qiymatlari ustiga yozilardi.
CREATE TABLE partner_channels (
    id                   uuid          PRIMARY KEY,
    partner_user_id      uuid          NOT NULL,
    application_id       uuid          NOT NULL UNIQUE,
    telegram_channel_id  bigint        NOT NULL UNIQUE,
    title                text          NOT NULL,
    username             text,
    photo_file_id        text,
    subscriber_count     integer       NOT NULL,
    subscriber_synced_at timestamptz   NOT NULL DEFAULT now(),
    -- Tasodifiy, ismdan yasalmagan: kanal nomi o'zgarsa havola
    -- buzilmasin va birovning kodini taxmin qilib bo'lmasin.
    link_code            text          NOT NULL UNIQUE,
    post_price_som       numeric(14,2) NOT NULL,
    -- NULL = global sozlamaga ergashadi. Global qiymatni yaratilish
    -- paytida NUSXALAB olsak, admin keyin global sozlamani
    -- o'zgartirganda bu kanal jimgina eski shartda qolardi — bu
    -- aynan adminning kutganiga zid.
    payout_mode          text,
    trade_percent_bp     integer,
    fixed_monthly_som    numeric(14,2),
    active               boolean       NOT NULL DEFAULT true,
    created_at           timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_partner_channels_price CHECK (post_price_som >= 0),
    CONSTRAINT chk_partner_channels_mode  CHECK (payout_mode IS NULL OR payout_mode IN ('PERCENT', 'FIXED')),
    CONSTRAINT chk_partner_channels_bp    CHECK (trade_percent_bp IS NULL OR (trade_percent_bp >= 0 AND trade_percent_bp <= 10000)),
    CONSTRAINT chk_partner_channels_fixed CHECK (fixed_monthly_som IS NULL OR fixed_monthly_som >= 0)
);

-- Qidiruv: bo'sh so'rovda obunachi bo'yicha reyting, yozilganda nom
-- boshlanishi bo'yicha. Faqat faol kanallar ko'rinadi.
CREATE INDEX idx_partner_channels_ranking
    ON partner_channels (subscriber_count DESC) WHERE active;

-- E'lonning kanalga joylanishi.
--
-- order_id bitta tanlash amalida buyurilgan postlarni guruhlaydi:
-- sotuvchi TO'PLAMGA rozi bo'ladi va pul ham shu to'plam uchun bir
-- yo'la ushlanadi (§4.1). Usiz 12 000 so'mi bor odam uchta 5 000 lik
-- kanal tanlab, ikkitasini olib qolardi.
CREATE TABLE listing_channel_posts (
    id                  uuid          PRIMARY KEY,
    order_id            uuid          NOT NULL,
    listing_id          uuid          NOT NULL,
    partner_channel_id  uuid          NOT NULL REFERENCES partner_channels (id),
    -- Buyurtma paytida muhrlanadi: narxini ko'targan hamkor
    -- allaqachon rozi bo'lgan sotuvchidan ko'proq ola olmaydi.
    price_som           numeric(14,2) NOT NULL,
    state               text          NOT NULL,
    telegram_message_id text,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    posted_at           timestamptz,
    error               text,

    CONSTRAINT uk_listing_channel_posts UNIQUE (listing_id, partner_channel_id),
    CONSTRAINT chk_listing_channel_posts_state CHECK (
        state IN ('AWAITING_FUNDS', 'HELD', 'POSTED', 'FAILED', 'REFUNDED')),
    CONSTRAINT chk_listing_channel_posts_price CHECK (price_som >= 0)
);

CREATE INDEX idx_listing_channel_posts_order   ON listing_channel_posts (order_id);
CREATE INDEX idx_listing_channel_posts_channel ON listing_channel_posts (partner_channel_id, created_at DESC);

-- Global to'lov siyosati partner_settings ga qo'shiladi.
ALTER TABLE partner_settings
    ADD COLUMN default_payout_mode       text          NOT NULL DEFAULT 'PERCENT',
    ADD COLUMN default_trade_percent_bp  integer       NOT NULL DEFAULT 1000,
    ADD COLUMN default_fixed_monthly_som numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN min_post_price_som        numeric(14,2) NOT NULL DEFAULT 1000,
    ADD COLUMN max_post_price_som        numeric(14,2) NOT NULL DEFAULT 100000;

-- Foiz ASOS PUNKTIDA saqlanadi, foizda emas: 10.5% ni butun songa
-- sig'dirib bo'lmaydi, numeric(5,2) esa settle paytida yaxlitlash
-- bahsini ochadi. 1000 bp = 10%.
ALTER TABLE partner_settings
    ADD CONSTRAINT chk_partner_settings_mode  CHECK (default_payout_mode IN ('PERCENT', 'FIXED')),
    ADD CONSTRAINT chk_partner_settings_bp    CHECK (default_trade_percent_bp BETWEEN 0 AND 10000),
    ADD CONSTRAINT chk_partner_settings_fixed CHECK (default_fixed_monthly_som >= 0),
    ADD CONSTRAINT chk_partner_settings_bounds CHECK (min_post_price_som <= max_post_price_som);
```

- [ ] **Step 2: Write the failing test**

`PartnerAdSchemaIT.java` — copy the container preamble from
`referral/ReferralSchemaIT.java` verbatim (`@DataJpaTest`, `@Testcontainers`, the same
`@TestPropertySource` block, and a `Config` inner class with `@EntityScan`/`@EnableJpaRepositories`
pointing at `PartnerChannel.class` with `considerNestedRepositories = true`), then:

```java
@Test
@DisplayName("one channel cannot be advertised twice for the same listing")
void oneOrderPerChannelPerListing() {
    PartnerChannel channel = savedChannel("Efootball Uz", 50_239, new BigDecimal("10000.00"));
    UUID listing = UUID.randomUUID();
    posts.saveAndFlush(post(UUID.randomUUID(), listing, channel, "HELD"));

    assertThatThrownBy(() -> em.getEntityManager()
            .createNativeQuery("""
                    insert into listing_channel_posts
                        (id, order_id, listing_id, partner_channel_id, price_som, state, created_at)
                    values (?1, ?2, ?3, ?4, 10000.00, 'HELD', now())
                    """)
            .setParameter(1, UUID.randomUUID())
            .setParameter(2, UUID.randomUUID())
            .setParameter(3, listing)
            .setParameter(4, channel.getId())
            .executeUpdate())
            .hasMessageContaining("uk_listing_channel_posts");
}

@Test
@DisplayName("a state the code does not know is rejected")
void unknownStateRejected() {
    PartnerChannel channel = savedChannel("Test", 1000, new BigDecimal("5000.00"));
    ListingChannelPost bad = post(UUID.randomUUID(), UUID.randomUUID(), channel, "PENDING");
    assertThatThrownBy(() -> posts.saveAndFlush(bad))
            .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
@DisplayName("a percentage above 100% is rejected")
void percentCeiling() {
    PartnerChannel channel = channel("Test", 1000, new BigDecimal("5000.00"));
    channel.setTradePercentBp(10_001);
    assertThatThrownBy(() -> channels.saveAndFlush(channel))
            .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
@DisplayName("the global payout defaults are seeded on the existing settings row")
void settingsDefaultsSeeded() {
    var settings = settingsRepository.findById(PartnerSettings.SINGLETON_ID).orElseThrow();
    assertThat(settings.getDefaultTradePercentBp()).isEqualTo(1000);
    assertThat(settings.getMinPostPriceSom()).isEqualByComparingTo("1000");
    assertThat(settings.getMaxPostPriceSom()).isEqualByComparingTo("100000");
}

@Test
@DisplayName("bounds that cross are rejected")
void crossedBoundsRejected() {
    var settings = settingsRepository.findById(PartnerSettings.SINGLETON_ID).orElseThrow();
    settings.setMinPostPriceSom(new BigDecimal("50000"));
    settings.setMaxPostPriceSom(new BigDecimal("1000"));
    assertThatThrownBy(() -> settingsRepository.saveAndFlush(settings))
            .isInstanceOf(DataIntegrityViolationException.class);
}
```

Helpers in the same class:

```java
private PartnerChannel channel(String title, int subscribers, BigDecimal price) {
    PartnerChannel c = new PartnerChannel();
    c.setId(UUID.randomUUID());
    c.setPartnerUserId(UUID.randomUUID());
    c.setApplicationId(UUID.randomUUID());
    c.setTelegramChannelId(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
    c.setTitle(title);
    c.setSubscriberCount(subscribers);
    c.setSubscriberSyncedAt(Instant.now());
    c.setLinkCode(UUID.randomUUID().toString().substring(0, 8).toUpperCase());
    c.setPostPriceSom(price);
    return c;
}

private PartnerChannel savedChannel(String title, int subscribers, BigDecimal price) {
    return channels.saveAndFlush(channel(title, subscribers, price));
}

private ListingChannelPost post(UUID orderId, UUID listingId, PartnerChannel channel, String state) {
    ListingChannelPost p = new ListingChannelPost();
    p.setId(UUID.randomUUID());
    p.setOrderId(orderId);
    p.setListingId(listingId);
    p.setPartnerChannelId(channel.getId());
    p.setPriceSom(channel.getPostPriceSom());
    p.setState(state);
    return p;
}
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=PartnerAdSchemaIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — `PartnerChannel` and `ListingChannelPost` do not exist.

- [ ] **Step 4: Write the entities**

`PartnerChannel.java` — plain `@Entity` with `@Id UUID id` (assigned, like `Referral`), `@Getter`
`@Setter` `@NoArgsConstructor`, and one field per column above. `state` on the post is a `String`
rather than an enum so the CHECK constraint stays the single source of the allowed values; add a
`public enum State { AWAITING_FUNDS, HELD, POSTED, FAILED, REFUNDED }` **inside**
`ListingChannelPost` and set the column with `State.name()` at the call sites.

`PartnerSettings.java` gains the five new fields with the same `@Column` names.

`PartnerAdRepositories.java`:

```java
package uz.efbazaar.marketplace.partner.ads;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class PartnerAdRepositories {

    private PartnerAdRepositories() {}

    public interface PartnerChannelRepository extends JpaRepository<PartnerChannel, UUID> {
        Optional<PartnerChannel> findByPartnerUserIdAndActiveTrue(UUID partnerUserId);
        Optional<PartnerChannel> findByLinkCode(String linkCode);
        Optional<PartnerChannel> findByApplicationId(UUID applicationId);
        boolean existsByLinkCode(String linkCode);
        List<PartnerChannel> findByActiveTrueOrderBySubscriberCountDesc();
        List<PartnerChannel> findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(String prefix);
    }

    public interface ListingChannelPostRepository extends JpaRepository<ListingChannelPost, UUID> {
        List<ListingChannelPost> findByOrderId(UUID orderId);
        List<ListingChannelPost> findByListingId(UUID listingId);
        List<ListingChannelPost> findByPartnerChannelIdOrderByCreatedAtDesc(UUID partnerChannelId);
        List<ListingChannelPost> findByPartnerChannelIdAndState(UUID partnerChannelId, String state);
    }
}
```

- [ ] **Step 5: Register the repositories in the context smoke test**

`MarketplaceApplicationTests` mocks every repository by hand; a missing one fails the whole context.
Add beside the partner block:

```java
    @MockBean uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository partnerChannelRepository;
    @MockBean uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository listingChannelPostRepository;
```

- [ ] **Step 6: Run the test and the full suite**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=PartnerAdSchemaIT -DargLine="-Dapi.version=1.44"
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44"
```

Expected: PASS, and the full suite stays green.

- [ ] **Step 7: Mutation-check the uniqueness constraint**

Delete `CONSTRAINT uk_listing_channel_posts UNIQUE (listing_id, partner_channel_id)` from the
migration, rerun `PartnerAdSchemaIT`, confirm `oneOrderPerChannelPerListing` fails. Restore it.

A constraint nobody has watched fail is a guess, not a guard.

- [ ] **Step 8: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V43__partner_channels_and_posts.sql \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/partner/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/
git commit -m "feat(partners): channels, orders and posts

partner_channels is separate from partner_applications on purpose. An
application records a decision and must not change; a channel carries the
settings that move for the life of the partnership.

A null payout override means 'follow the global setting' rather than a
copy of today's value. Copying would leave a channel silently on old
terms the next time an admin edits the global policy — the opposite of
what editing it is for.

order_id groups the channels picked in one action, because the seller
agrees to a set and the money has to move for that set as a whole."
```

---

### Task 2: Create the channel on approval, and backfill the ones already approved

**Files:**
- Modify: `.../partner/PartnerService.java` (the approve path, and `cancelByUser`/`cancelByAdmin`/`onChannelRemoved`)
- Create: `.../partner/ads/PartnerChannelService.java`
- Modify: `.../referral/ReferralCodeService.java` (resolve a channel code too)
- Create: `backend/marketplace-service/src/main/resources/db/migration/R__partner_channel_backfill.sql`
- Test: `.../partner/ads/PartnerChannelServiceTest.java`

**Interfaces:**
- Consumes: `PartnerAdRepositories.PartnerChannelRepository` (Task 1), `PartnerSettings`.
- Produces: `PartnerChannelService.onApproved(PartnerApplication)`, `PartnerChannelService.deactivate(UUID partnerUserId)`, and `ReferralCodeService.resolve` now also resolving a channel code to its owner.

- [ ] **Step 1: Write the failing test**

```java
@Test
@DisplayName("approving an application opens its advertising channel")
void createsChannelOnApproval() {
    PartnerApplication app = approvedApplication();

    service.onApproved(app);

    var saved = captureSavedChannel();
    assertThat(saved.getPartnerUserId()).isEqualTo(app.getUserId());
    assertThat(saved.getTelegramChannelId()).isEqualTo(app.getChannelId());
    assertThat(saved.getSubscriberCount()).isEqualTo(app.getSubscriberCount());
    assertThat(saved.isActive()).isTrue();
}

@Test
@DisplayName("the channel starts at the lowest price the admin allows")
void startsAtTheMinimumPrice() {
    // Hamkor narxni o'zi qo'yadi. Boshlang'ich qiymat eng past
    // ruxsat etilgani: sozlamaguncha kanal qimmat ko'rinib turmasin.
    service.onApproved(approvedApplication());
    assertThat(captureSavedChannel().getPostPriceSom()).isEqualByComparingTo("1000");
}

@Test
@DisplayName("the payout override starts empty so the channel follows the global policy")
void payoutStartsUnset() {
    service.onApproved(approvedApplication());
    var saved = captureSavedChannel();
    assertThat(saved.getPayoutMode()).isNull();
    assertThat(saved.getTradePercentBp()).isNull();
    assertThat(saved.getFixedMonthlySom()).isNull();
}

@Test
@DisplayName("approving the same application twice does not open a second channel")
void idempotentOnApproval() {
    PartnerApplication app = approvedApplication();
    when(channels.findByApplicationId(app.getId()))
            .thenReturn(Optional.of(new PartnerChannel()));

    service.onApproved(app);

    verify(channels, never()).save(any());
}

@Test
@DisplayName("cancelling the partnership takes the channel out of the picker")
void deactivateOnCancel() {
    PartnerChannel existing = new PartnerChannel();
    existing.setActive(true);
    when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.of(existing));

    service.deactivate(partnerId);

    assertThat(existing.isActive()).isFalse();
    verify(channels).save(existing);
}

@Test
@DisplayName("deactivating when there is no channel is not an error")
void deactivateWithoutChannel() {
    when(channels.findByPartnerUserIdAndActiveTrue(partnerId)).thenReturn(Optional.empty());
    assertThatCode(() -> service.deactivate(partnerId)).doesNotThrowAnyException();
}
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=PartnerChannelServiceTest
```

Expected: compilation failure — `PartnerChannelService` does not exist.

- [ ] **Step 3: Write `PartnerChannelService`**

```java
package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerApplication;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

/**
 * Tasdiqlangan hamkorlikning reklama kanalini ochadi va yopadi.
 *
 * <p>Kanal ariza tasdiqlangan paytda tug'iladi, chunki reklama bozorida
 * ko'rinish uchun kerak bo'lgan hamma narsa — nom, obunachi soni, egasi
 * — aynan o'sha paytda ma'lum bo'ladi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerChannelService {

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PartnerChannelRepository channels;
    private final PartnerSettingsRepository settingsRepository;

    @Transactional
    public void onApproved(PartnerApplication application) {
        // Ikki marta tasdiqlash yoki hodisaning qayta yetkazilishi
        // ikkinchi kanal ochmasin: ariza bo'yicha yagona kanal bo'ladi.
        if (channels.findByApplicationId(application.getId()).isPresent()) return;

        PartnerSettings settings = settings();

        PartnerChannel channel = new PartnerChannel();
        channel.setId(UUID.randomUUID());
        channel.setPartnerUserId(application.getUserId());
        channel.setApplicationId(application.getId());
        channel.setTelegramChannelId(application.getChannelId());
        channel.setTitle(application.getChannelTitle());
        channel.setUsername(application.getChannelUsername());
        channel.setSubscriberCount(application.getSubscriberCount() == null
                ? 0 : application.getSubscriberCount());
        channel.setSubscriberSyncedAt(Instant.now());
        channel.setLinkCode(freshCode());
        // Eng past ruxsat etilgan narxdan boshlaymiz. Hamkor uni o'z
        // panelidan ko'taradi; sozlamagunicha kanali eng arzon bo'lib
        // turgani, qimmat bo'lib turganidan yaxshiroq.
        channel.setPostPriceSom(settings.getMinPostPriceSom());
        // To'lov sozlamalari BO'SH qoldiriladi — kanal global siyosatga
        // ergashadi. Bugungi qiymatni nusxalab olsak, admin siyosatni
        // o'zgartirganda bu kanal eski shartda qolib ketardi.
        channels.save(channel);

        log.info("Hamkor kanali ochildi: {} ({}), egasi {}",
                channel.getTitle(), channel.getTelegramChannelId(), channel.getPartnerUserId());
    }

    /**
     * Hamkorlik to'xtaganda kanalni qidiruvdan chiqaradi.
     *
     * <p>O'CHIRILMAYDI, faqat {@code active = false}. Chiqib bo'lgan
     * postlar va ular keltirgan savdolar kanalga bog'langan holda
     * qoladi — hisobot ularni yo'qotmasligi kerak.
     */
    @Transactional
    public void deactivate(UUID partnerUserId) {
        channels.findByPartnerUserIdAndActiveTrue(partnerUserId).ifPresent(channel -> {
            channel.setActive(false);
            channels.save(channel);
            log.info("Hamkor kanali qidiruvdan chiqarildi: {}", channel.getId());
        });
    }

    PartnerSettings settings() {
        return settingsRepository.findById(PartnerSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("partner_settings qatori yo'q"));
    }

    private String freshCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (!channels.existsByLinkCode(candidate)) return candidate;
        }
        throw new IllegalStateException("Kanal kodi yaratilmadi: " + MAX_ATTEMPTS + " urinish to'qnashdi");
    }
}
```

- [ ] **Step 4: Call it from the partner lifecycle**

In `PartnerService`, after the application status becomes `APPROVED` and the approval event is
published, call `partnerChannels.onApproved(application)`. In `cancelByUser`, `cancelByAdmin` and
`onChannelRemoved`, call `partnerChannels.deactivate(userId)`.

Read those methods before editing: each already publishes an event and sets `cancelReason`, and the
deactivation belongs beside that, in the same transaction.

- [ ] **Step 5: Extend `ReferralCodeService.resolve` to channel codes**

The method already carries the note saying phase 2 extends it rather than adding a second lookup.
Do exactly that:

```java
    @Transactional(readOnly = true)
    public Optional<UUID> resolve(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        String normalised = code.trim().toUpperCase();

        Optional<UUID> user = codes.findByCode(normalised).map(ReferralCode::getUserId);
        if (user.isPresent()) return user;

        // Kanaldagi e'lon posti havolasi kanal kodini olib yuradi va
        // KANAL EGASINI ko'rsatadi: hamkor ham foydalanuvchi, va uning
        // kanali orqali kelgan odam uning referali.
        return channels.findByLinkCode(normalised).map(PartnerChannel::getPartnerUserId);
    }
```

Add `PartnerChannelRepository` as a constructor dependency and update the three existing
`new ReferralCodeService(...)` call sites in the referral tests with one extra
`mock(PartnerChannelRepository.class)`.

Note the annotation goes back on: `resolve` is read-only and now reads two tables, so a single
read transaction is right. `codeFor` stays without one — it writes, and Task 1 of the referral plan
explains why.

- [ ] **Step 5b: Refund the orders a cancellation strands**

Spec §6.1. When a partnership ends, orders already `HELD` but not yet posted will never be
delivered — the bot has lost its rights on that channel. Leaving them held would strand the seller's
money with nothing to show for it and nobody watching.

Add to `PartnerChannelService.deactivate`, after the channel is marked inactive:

```java
        // HELD, lekin hali chiqmagan buyurtmalar hech qachon chiqmaydi:
        // bot kanalda administrator emas. Sotuvchining puli ushlangan
        // holda qolib ketmasin.
        //
        // POSTED bo'lganlariga TEGILMAYDI: reklama yetkazilgan va
        // to'langan, va u keltirgan savdolar ham to'lanaveradi —
        // `trades` dagi muhrlangan qiymat `active` ga qaramaydi.
        posts.findByPartnerChannelIdAndState(channel.getId(), State.HELD.name())
                .forEach(channelPosts::refundStranded);
```

with a test asserting exactly that split:

```java
@Test
@DisplayName("cancelling refunds the held orders and leaves the delivered ones alone")
void cancellationRefundsOnlyWhatNeverShipped() {
    ListingChannelPost held = post(channel, "HELD");
    ListingChannelPost delivered = post(channel, "POSTED");
    when(posts.findByPartnerChannelIdAndState(channel.getId(), "HELD")).thenReturn(List.of(held));

    service.deactivate(partnerId);

    verify(channelPosts).refundStranded(held);
    verify(channelPosts, never()).refundStranded(delivered);
}
```

`ChannelPostService.refundStranded(post)` reuses the refund path of Task 4 and sets the state to
`REFUNDED` with an error explaining the partnership ended.

- [ ] **Step 6: Write the backfill**

`R__partner_channel_backfill.sql` — repeatable, not versioned, because it is idempotent data rather
than DDL and re-runs harmlessly:

```sql
-- Allaqachon tasdiqlangan hamkorliklarga kanal ochadi.
--
-- REPEATABLE, chunki bu DDL emas: ON CONFLICT bilan qayta ishga
-- tushirilsa hech narsa buzilmaydi. Yangi tasdiqlar kod orqali keladi;
-- bu fayl faqat reklama bozori qurilishidan OLDIN tasdiqlangan
-- arizalarni ushlaydi.
--
-- Kod bu yerda md5 dan olinadi, tasodifiy emas: SQL ichida takroriy
-- urinish halqasi yo'q, va ariza identifikatori allaqachon yagona.
INSERT INTO partner_channels (
    id, partner_user_id, application_id, telegram_channel_id,
    title, username, subscriber_count, subscriber_synced_at,
    link_code, post_price_som, active, created_at)
SELECT
    gen_random_uuid(),
    a.user_id,
    a.id,
    a.channel_id,
    coalesce(a.channel_title, 'Kanal'),
    a.channel_username,
    coalesce(a.subscriber_count, 0),
    coalesce(a.verified_at, now()),
    upper(substr(translate(md5(a.id::text), '01ilo', 'ABCDE'), 1, 8)),
    s.min_post_price_som,
    true,
    coalesce(a.reviewed_at, now())
FROM partner_applications a
CROSS JOIN partner_settings s
WHERE a.status = 'APPROVED'
  AND a.channel_id IS NOT NULL
ON CONFLICT (application_id) DO NOTHING;
```

- [ ] **Step 7: Run the tests**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44"
```

Expected: PASS, including the referral tests whose constructor gained an argument.

- [ ] **Step 8: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/ \
        backend/marketplace-service/src/main/resources/db/migration/R__partner_channel_backfill.sql \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/
git commit -m "feat(partners): open the advertising channel when a partnership is approved

resolve() gained the channel lookup rather than a second path, exactly as
the note on that method asked. A channel code resolves to the channel's
owner: a partner is a user, and somebody who arrived through their channel
is their referral.

Cancelling deactivates rather than deletes. Posts already published and
the trades they produced stay attached to the channel; reporting must not
lose them.

The backfill is repeatable because it is idempotent data, not DDL."
```

---

### Task 3: Pricing and the channel directory

**Files:**
- Create: `.../partner/ads/PartnerPricing.java`
- Create: `.../partner/ads/ChannelDirectoryService.java`
- Create: `.../partner/ads/PartnerAdDtos.java`
- Create: `.../partner/ads/ChannelDirectoryController.java`
- Test: `.../partner/ads/ChannelDirectoryServiceTest.java`

**Interfaces:**
- Produces: `PartnerPricing.priceFor(PartnerChannel channel, Listing listing) -> BigDecimal`; `ChannelDirectoryService.search(String query) -> List<ChannelCard>`; `ChannelCard(UUID channelId, String title, String username, String photoUrl, int subscriberCount, BigDecimal priceSom)`; `GET /api/v1/partners/channels?q=`.

- [ ] **Step 1: Write the failing test**

```java
@Test
@DisplayName("an empty query ranks every active channel by subscribers")
void emptyQueryRanksBySubscribers() {
    when(channels.findByActiveTrueOrderBySubscriberCountDesc())
            .thenReturn(List.of(channel("Efootball Uz", 50_239), channel("Kichik kanal", 1_200)));

    assertThat(service.search("")).extracting(ChannelCard::title)
            .containsExactly("Efootball Uz", "Kichik kanal");
}

@Test
@DisplayName("a query matches the start of the title, still ranked by subscribers")
void prefixSearchRanksBySubscribers() {
    when(channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc("PRE"))
            .thenReturn(List.of(
                    channel("Premium Efootball akkountlari", 4_219),
                    channel("Prefer Efootball", 2_334)));

    assertThat(service.search("Pre")).extracting(ChannelCard::title)
            .containsExactly("Premium Efootball akkountlari", "Prefer Efootball");
}

@Test
@DisplayName("a card carries the price the seller will actually be charged")
void cardCarriesPrice() {
    PartnerChannel c = channel("Efootball Uz", 50_239);
    c.setPostPriceSom(new BigDecimal("15000.00"));
    when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of(c));

    assertThat(service.search(null).get(0).priceSom()).isEqualByComparingTo("15000.00");
}

@Test
@DisplayName("a blank-ish query is treated as no query")
void whitespaceIsNoQuery() {
    when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of());
    service.search("   ");
    verify(channels).findByActiveTrueOrderBySubscriberCountDesc();
    verify(channels, never())
            .findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(any());
}
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ChannelDirectoryServiceTest
```

Expected: compilation failure — `ChannelDirectoryService` does not exist.

- [ ] **Step 3: Write `PartnerPricing`**

```java
package uz.efbazaar.marketplace.partner.ads;

import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.math.BigDecimal;

/**
 * Kanalga e'lon joylash narxi.
 *
 * <p>BU YAGONA SEAM. Narx hech qayerda {@code channel.getPostPriceSom()}
 * dan to'g'ridan-to'g'ri o'qilmaydi — hamma joyda shu metod chaqiriladi.
 *
 * <p>Sababi kelajakda: hamkorlar narxni akkount kuchiga qarab
 * belgilashlari kerak bo'ladi (team strength 3000+ uchun 15 000,
 * 2000+ uchun 5 000). O'sha kuni shu metodning ICHI o'zgaradi va
 * chaqiruvchilarning bittasiga ham tegilmaydi. Bugun u bitta ustunni
 * qaytaradi, va {@code listing} parametri ataylab qabul qilinadi
 * (ishlatilmasa ham) — imzo o'zgarmasin uchun.
 */
@Component
public class PartnerPricing {

    public BigDecimal priceFor(PartnerChannel channel, Listing listing) {
        return channel.getPostPriceSom();
    }
}
```

- [ ] **Step 4: Write the DTOs and the directory service**

`PartnerAdDtos.ChannelCard`:

```java
    /**
     * Qidiruvdagi kanal kartochkasi.
     *
     * <p>HAMKOR EMAS, KANAL ko'rsatiladi: sotuvchi auditoriya sotib
     * olayapti va uning egasi kimligi unga qiziq emas.
     */
    public record ChannelCard(
            UUID channelId,
            String title,
            String username,
            String photoUrl,
            int subscriberCount,
            BigDecimal priceSom) {}
```

`ChannelDirectoryService`:

```java
package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelCard;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.util.List;

/** E'lon berayotgan sotuvchi ko'radigan kanallar ro'yxati. */
@Service
@RequiredArgsConstructor
public class ChannelDirectoryService {

    private final PartnerChannelRepository channels;
    private final PartnerPricing pricing;

    /**
     * @param query bo'sh bo'lsa — obunachi bo'yicha reyting; yozilgan
     *              bo'lsa nom boshlanishi bo'yicha, ichida yana
     *              obunachi bo'yicha.
     */
    @Transactional(readOnly = true)
    public List<ChannelCard> search(String query) {
        String prefix = query == null ? "" : query.trim();

        List<PartnerChannel> found = prefix.isEmpty()
                ? channels.findByActiveTrueOrderBySubscriberCountDesc()
                : channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(
                        prefix.toUpperCase());

        return found.stream().map(this::card).toList();
    }

    private ChannelCard card(PartnerChannel channel) {
        return new ChannelCard(
                channel.getId(),
                channel.getTitle(),
                channel.getUsername(),
                // Rasm bot orqali keladi; fayl identifikatori bevosita
                // brauzerga berilmaydi, proxy manzili beriladi.
                channel.getPhotoFileId() == null
                        ? null
                        : "/api/marketplace/v1/partners/channels/" + channel.getId() + "/photo",
                channel.getSubscriberCount(),
                // priceFor, getPostPriceSom emas — tariflar shu yerdan
                // qo'shiladi va bu chaqiruv o'zgarmaydi.
                pricing.priceFor(channel, null));
    }
}
```

- [ ] **Step 5: Write the controller**

```java
package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelCard;

import java.util.List;

/** E'lon berish oynasidagi kanal tanlash paneli. */
@RestController
@RequestMapping("/api/v1/partners/channels")
@RequiredArgsConstructor
public class ChannelDirectoryController {

    private final ChannelDirectoryService service;

    @GetMapping
    public List<ChannelCard> search(@RequestParam(name = "q", required = false) String query) {
        return service.search(query);
    }
}
```

- [ ] **Step 6: Verify the prefix search against a real database**

`StartsWithIgnoreCase` is a derived query whose SQL only exists at runtime. Add to
`PartnerAdSchemaIT`:

```java
@Test
@DisplayName("prefix search is case-insensitive and skips inactive channels")
void prefixSearchAgainstPostgres() {
    savedChannel("Premium Efootball", 4_219, new BigDecimal("5000"));
    savedChannel("Prefer Efootball", 2_334, new BigDecimal("5000"));
    savedChannel("Boshqa kanal", 9_999, new BigDecimal("5000"));

    PartnerChannel closed = savedChannel("Premium yopiq", 8_000, new BigDecimal("5000"));
    closed.setActive(false);
    channels.saveAndFlush(closed);

    var found = channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc("PRE");

    assertThat(found).extracting(PartnerChannel::getTitle)
            .containsExactly("Premium Efootball", "Prefer Efootball");
}
```

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest='ChannelDirectoryServiceTest,PartnerAdSchemaIT' -DargLine="-Dapi.version=1.44"`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/partner/ads/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/partner/ads/
git commit -m "feat(partners): the channel directory a seller picks from

Price is never read from the column directly. Every caller goes through
PartnerPricing.priceFor(channel, listing), which today returns that
column and takes a listing it does not use — so that pricing by team
strength changes one method body and no call site.

The card shows the channel, not the partner. A seller is buying an
audience and has no reason to care who owns it."
```

---

### Task 4: Ordering channels, and holding the seller's money

**Files:**
- Modify: `backend/payment-service/.../wallet/domain/TransactionKind.java`
- Create: `backend/payment-service/.../partnerads/PartnerAdLedgerService.java`
- Create: `backend/payment-service/.../partnerads/InternalPartnerAdController.java`
- Create: `.../partner/ads/PartnerAdClient.java`
- Create: `.../partner/ads/ChannelPostService.java`
- Modify: `.../service/ListingService.java` (accept the chosen channels on create)
- Modify: `.../dto/ListingCreateRequest.java`
- Test: `backend/payment-service/.../partnerads/PartnerAdLedgerServiceTest.java`
- Test: `.../partner/ads/ChannelPostServiceTest.java`

**Interfaces:**
- Consumes: `LedgerService.post(TransactionKind, String idempotencyKey, UUID createdBy, String note, List<Posting>)`.
- Produces: `PartnerAdLedgerService.hold(UUID orderId, UUID sellerId, long totalTiyin)`, `.settle(UUID postId, UUID sellerId, UUID partnerUserId, long priceTiyin)`, `.refund(UUID postId, UUID sellerId, long priceTiyin)`, `.monthly(UUID channelId, UUID partnerUserId, long amountTiyin, String period)` (used by Task 8); `POST /internal/partner-ads/{hold,settle,refund,monthly}`; `ChannelPostService.order(UUID sellerId, UUID listingId, List<UUID> channelIds) -> OrderResult`.

- [ ] **Step 1: Add the transaction kinds**

`kind` is a plain `VARCHAR(24)` with no CHECK (`V1__wallets_and_ledger.sql:24`), so **no migration is
needed** — but verify that before writing one, and check the longest new name fits:
`PARTNER_POST_SETTLE` and `PARTNER_TRADE_SHARE` are 19 characters.

```java
    /** Sotuvchining reklama uchun ushlangan mablag'i. */
    PARTNER_POST_HOLD,
    /** Post chiqqach hamkorga o'tkazilishi. */
    PARTNER_POST_SETTLE,
    /** Post chiqmadi — sotuvchiga qaytarish. */
    PARTNER_POST_REFUND,
    /** Kanaldan kelgan savdodan hamkor ulushi. */
    PARTNER_TRADE_SHARE,
    /** Fiks rejimdagi hamkorga oylik to'lov. */
    PARTNER_MONTHLY,
```

- [ ] **Step 2: Write the failing ledger test**

```java
@Test
@DisplayName("the hold covers the whole order in one transaction")
void holdIsWholeOrder() {
    service.hold(orderId, seller, 1_500_000L);

    var postings = capturePostings();
    assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
    assertThat(postings)
            .contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, 1_500_000L))
            .contains(new Posting(LedgerAccount.USER_HELD, seller, -1_500_000L));
    verify(ledger).post(eq(TransactionKind.PARTNER_POST_HOLD),
            eq("partner-post-hold:" + orderId), any(), anyString(), any());
}

@Test
@DisplayName("settling moves one post's price from the hold to the partner")
void settleMovesOnePost() {
    service.settle(postId, seller, partner, 500_000L);

    var postings = capturePostings();
    assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
    assertThat(postings)
            .contains(new Posting(LedgerAccount.USER_HELD, seller, 500_000L))
            .contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -500_000L));
    verify(ledger).post(eq(TransactionKind.PARTNER_POST_SETTLE),
            eq("partner-post:" + postId), any(), anyString(), any());
}

@Test
@DisplayName("refunding returns one post's price to the seller")
void refundReturnsToSeller() {
    service.refund(postId, seller, 500_000L);

    var postings = capturePostings();
    assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
    assertThat(postings)
            .contains(new Posting(LedgerAccount.USER_HELD, seller, 500_000L))
            .contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, -500_000L));
    verify(ledger).post(eq(TransactionKind.PARTNER_POST_REFUND),
            eq("partner-post-refund:" + postId), any(), anyString(), any());
}

@Test
@DisplayName("the hold is keyed on the order, so a second order for the same listing still charges")
void holdKeyIsTheOrderNotTheListing() {
    // Kalit e'lon bo'lsa, sotuvchi keyinroq yana kanal qo'shganda
    // LedgerService uni takror deb bilib, jimgina pul yechmasdi.
    service.hold(orderId, seller, 500_000L);
    UUID secondOrder = UUID.randomUUID();
    service.hold(secondOrder, seller, 500_000L);

    verify(ledger).post(any(), eq("partner-post-hold:" + orderId), any(), anyString(), any());
    verify(ledger).post(any(), eq("partner-post-hold:" + secondOrder), any(), anyString(), any());
}

@Test
@DisplayName("a zero amount posts nothing rather than a zero entry")
void zeroPostsNothing() {
    service.hold(orderId, seller, 0L);
    verify(ledger, never()).post(any(), anyString(), any(), anyString(), any());
}

@Test
@DisplayName("insufficient funds names the shortfall the way the frontend recognises")
void insufficientFunds() {
    // Frontend `isInsufficientFunds` bilan taniydi va shu matndan
    // hamyonni to'ldirish havolasini yasaydi — shakl saqlanishi shart.
    when(ledger.balanceOf(seller)).thenReturn(walletWith(300_000L));

    assertThatThrownBy(() -> service.hold(orderId, seller, 500_000L))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Hamyonda mablag' yetarli emas")
            .hasMessageContaining("2000");
}
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=PartnerAdLedgerServiceTest
```

Expected: compilation failure — `PartnerAdLedgerService` does not exist.

- [ ] **Step 4: Write `PartnerAdLedgerService`**

Model the shape on `wallet/service/TradeEscrowService.java` and the insufficient-funds message on
`partner/PartnerFeeService.requireFunds` — copy that message verbatim so the frontend keeps
recognising it.

```java
    @Transactional
    public void hold(UUID orderId, UUID sellerId, long totalTiyin) {
        if (totalTiyin <= 0) return;
        requireFunds(sellerId, totalTiyin);

        ledger.post(TransactionKind.PARTNER_POST_HOLD,
                "partner-post-hold:" + orderId, null,
                "channel ad order " + orderId,
                List.of(
                        new Posting(LedgerAccount.USER_AVAILABLE, sellerId, totalTiyin),
                        new Posting(LedgerAccount.USER_HELD, sellerId, -totalTiyin)));
    }
```

`settle` and `refund` follow the same shape with their own kinds and keys. Every key is the post or
the order — **never the listing**, for the reason the fourth test names.

- [ ] **Step 5: Write the internal controller**

Copy the class annotations from `partner/InternalPartnerFeeController.java`, including
`@ResponseStatus(HttpStatus.NO_CONTENT)`. `InternalSecretFilter` already guards everything under
`/internal/` by path prefix, so no new wiring is needed — confirm that rather than assuming it.

- [ ] **Step 6: Write the failing marketplace-side test**

```java
@Test
@DisplayName("ordering three channels holds one total, not three amounts")
void holdsTheWholeOrder() {
    service.order(seller, listing, List.of(cheap.getId(), mid.getId(), dear.getId()));

    verify(payments).hold(any(), eq(seller), eq(new BigDecimal("30000.00")));
    verify(payments, never()).hold(any(), any(), eq(new BigDecimal("5000.00")));
}

@Test
@DisplayName("every post in an order shares its order id")
void oneOrderIdPerAction() {
    service.order(seller, listing, List.of(cheap.getId(), mid.getId()));

    var saved = captureSavedPosts();
    assertThat(saved).extracting(ListingChannelPost::getOrderId).containsOnly(saved.get(0).getOrderId());
}

@Test
@DisplayName("the price is frozen at order time")
void priceIsFrozen() {
    service.order(seller, listing, List.of(cheap.getId()));
    // Hamkor ertaga narxini ko'tarsa, allaqachon rozi bo'lgan
    // sotuvchidan ko'proq olinmaydi.
    assertThat(captureSavedPosts().get(0).getPriceSom()).isEqualByComparingTo("5000.00");
}

@Test
@DisplayName("an inactive channel cannot be ordered")
void inactiveChannelRejected() {
    cheap.setActive(false);
    assertThatThrownBy(() -> service.order(seller, listing, List.of(cheap.getId())))
            .isInstanceOf(ResponseStatusException.class);
    verify(payments, never()).hold(any(), any(), any());
}

@Test
@DisplayName("a wallet that cannot cover the total orders nothing at all")
void allOrNothing() {
    doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Hamyonda mablag' yetarli emas — 2000 so'm yetishmayapti"))
            .when(payments).hold(any(), any(), any());

    service.order(seller, listing, List.of(cheap.getId(), mid.getId()));

    // E'lon yo'qolmaydi va buyurtma AWAITING_FUNDS bo'lib turadi —
    // to'ldirilgan hamyon bilan "To'lash" tugmasi uni davom ettiradi.
    assertThat(captureSavedPosts()).allMatch(p -> "AWAITING_FUNDS".equals(p.getState()));
}

@Test
@DisplayName("a successful hold marks every post held")
void successMarksHeld() {
    service.order(seller, listing, List.of(cheap.getId(), mid.getId()));
    assertThat(captureSavedPosts()).allMatch(p -> "HELD".equals(p.getState()));
}
```

- [ ] **Step 7: Write `ChannelPostService.order` and wire it into listing creation**

`ListingCreateRequest` gains `List<UUID> channelIds` (nullable, treated as empty). `ListingService.create`
calls `channelPosts.order(sellerId, listing.getId(), request.channelIds())` **after** the listing row
exists — the listing is never lost because the wallet is short.

On a successful hold, publish `efbazaar.marketplace.channel-post-requested` per post, after commit.

- [ ] **Step 8: Run everything and commit**

```bash
cd backend/payment-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test
cd ../marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44"
git add backend/payment-service/src/ backend/marketplace-service/src/
git commit -m "feat(partners): order channels for a listing and hold the seller's money

One hold for the whole order. The seller picked a set and saw one total;
charging per channel would let somebody with 12 000 who picked three
5 000 channels end up advertising in two of them.

Settlement and refund stay per post, because posts land one at a time and
some fail while others succeed. USER_HELD is a per-user pool — the same
one trade escrow uses — so paying two partners out of one hold and
refunding the remainder needs no special handling.

Keys are the order and the post, never the listing. A seller who later
adds a channel to a listing they already advertised would otherwise
collide with the first order's key and LedgerService would decline to
charge them, silently."
```

---

### Task 5: The bot posts, and the money settles

**Files:**
- Create: `bot/src/main/java/uz/efbazaar/bot/partner/ChannelPostConsumer.java`
- Create: `bot/src/main/java/uz/efbazaar/bot/partner/ChannelPoster.java`
- Modify: `.../partner/ads/ChannelPostService.java` (add `onPosted` / `onFailed`)
- Modify: `.../partner/InternalPartnerController.java` (add the result endpoint)
- Modify: `CLAUDE.md` (Kafka topic list)
- Test: `bot/src/test/java/uz/efbazaar/bot/partner/ChannelPosterTest.java`
- Test: `.../partner/ads/ChannelPostResultTest.java`

**Interfaces:**
- Produces: topic `efbazaar.marketplace.channel-post-requested` `{ postId, listingId, telegramChannelId, caption, mediaMessageId, buttonUrl }`; `POST /internal/marketplace/v1/partners/channel-post-result` `{ postId, telegramMessageId, error }`; `ChannelPostService.onPosted(UUID postId, String telegramMessageId)` and `.onFailed(UUID postId, String error)`.

- [ ] **Step 1: Write the failing bot test**

```java
@Test
@DisplayName("the post carries a url button, not a web_app button")
void usesUrlButton() {
    // web_app tugmalari FAQAT shaxsiy chatda ishlaydi. Kanalga
    // qo'yilsa Telegram xabarni umuman qabul qilmaydi.
    poster.post(request("https://efbazaar.uz/marketplace/abc?p=K7M4XQP2"));

    verify(telegram).sendMessageWithUrlButton(eq("-1001234"), anyString(),
            argThat(b -> b.url().equals("https://efbazaar.uz/marketplace/abc?p=K7M4XQP2")));
}

@Test
@DisplayName("a post with media goes out as a photo")
void mediaBecomesAPhoto() {
    poster.post(requestWithMedia("photo-file-id"));
    verify(telegram).sendPhotoWithKeyboard(eq("-1001234"), eq("photo-file-id"), anyString(), any());
}

@Test
@DisplayName("a delivered post reports its message id back")
void reportsSuccess() {
    when(telegram.sendMessageWithUrlButton(any(), any(), any())).thenReturn(Optional.of(4242));
    poster.post(request("https://efbazaar.uz/x"));
    verify(results).report(argThat(r -> "4242".equals(r.telegramMessageId()) && r.error() == null));
}

@Test
@DisplayName("a rejected post reports the failure rather than staying silent")
void reportsFailure() {
    // Jimgina qolsa sotuvchining puli ushlangan holda abadiy turardi.
    when(telegram.sendMessageWithUrlButton(any(), any(), any())).thenReturn(Optional.empty());
    poster.post(request("https://efbazaar.uz/x"));
    verify(results).report(argThat(r -> r.telegramMessageId() == null && r.error() != null));
}
```

- [ ] **Step 2: Run it, confirm it fails, then write `ChannelPoster` and `ChannelPostConsumer`**

```bash
cd bot && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ChannelPosterTest
```

`ChannelPoster` uses `TelegramApiClient.sendMessageWithUrlButton` when the listing has no media, and
`sendPhotoWithUrlButton` when it does.

**Not `sendPhotoWithKeyboard`** — that method takes `List<List<WebAppButton>>` and builds a web_app
keyboard, which only works in private chats. A channel post carrying one is rejected by Telegram
outright, so the photo never appears either. `sendPhotoWithUrlButton` was added for exactly this and
is the photo twin of `sendMessageWithUrlButton`.

The poster then calls back over
`marketplaceWebClient` with `X-Internal-Secret` — the exact shape `ChannelVerifier.report` uses.
The consumer is a `@KafkaListener` on `efbazaar.marketplace.channel-post-requested`, group
`bot-channel-post`, with the same two `spring.json.*` properties every other consumer sets.

- [ ] **Step 3: Write the failing marketplace-side test**

```java
@Test
@DisplayName("a delivered post pays the partner")
void deliveredPostPays() {
    service.onPosted(post.getId(), "4242");

    assertThat(post.getState()).isEqualTo("POSTED");
    assertThat(post.getTelegramMessageId()).isEqualTo("4242");
    verify(payments).settle(post.getId(), seller, partnerUserId, new BigDecimal("5000.00"));
}

@Test
@DisplayName("a failed post refunds the seller")
void failedPostRefunds() {
    service.onFailed(post.getId(), "bot is not an administrator");

    assertThat(post.getState()).isEqualTo("REFUNDED");
    assertThat(post.getError()).isEqualTo("bot is not an administrator");
    verify(payments).refund(post.getId(), seller, new BigDecimal("5000.00"));
}

@Test
@DisplayName("a redelivered result pays once")
void redeliveryPaysOnce() {
    post.setState("POSTED");
    service.onPosted(post.getId(), "4242");
    verify(payments, never()).settle(any(), any(), any(), any());
}

@Test
@DisplayName("a result for a post nobody ordered is ignored, not an error")
void unknownPostIgnored() {
    when(posts.findById(any())).thenReturn(Optional.empty());
    assertThatCode(() -> service.onPosted(UUID.randomUUID(), "1")).doesNotThrowAnyException();
}
```

- [ ] **Step 4: Implement, run both suites, add the topic to CLAUDE.md, commit**

```
efbazaar.marketplace.channel-post-requested  # marketplace → bot (hamkor kanaliga e'lon joylash)
```

```bash
git add bot/src/ backend/marketplace-service/src/ CLAUDE.md
git commit -m "feat(partners): the bot posts to the channel and the money settles

The inline button is a url button. web_app buttons only work in private
chats and Telegram rejects the message outright in a channel.

A failure is reported rather than swallowed. Staying silent would leave
the seller's money held forever with nothing published and nothing to
show them."
```

---

### Task 6: Clicks, and which channel a buyer came from

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V44__partner_click_attribution.sql`
- Create: `.../partner/ads/PartnerClick.java`, `.../partner/ads/ListingPartnerAttribution.java`
- Modify: `.../partner/ads/PartnerAdRepositories.java`
- Create: `.../partner/ads/ListingAttributionService.java`
- Create: `.../partner/ads/InternalAttributionController.java`
- Modify: `frontend/src/proxy.ts` (record the click, not only the cookie)
- Test: `.../partner/ads/ListingAttributionServiceTest.java`

**Interfaces:**
- Consumes: `PartnerChannelRepository.findByLinkCode` (Task 2).
- Also creates: `PartnerPayoutPolicy.resolve(PartnerChannel) -> Payout(Mode mode, int tradePercentBp, BigDecimal fixedMonthlySom)`. It lives here rather than in Task 8 because the rate is needed the moment an attribution is resolved, and a task must not depend on one that follows it.
- Produces: `ListingAttributionService.recordClick(String linkCode, UUID listingId, UUID userId)`; `ListingAttributionService.attributionFor(UUID listingId, UUID buyerId) -> Optional<Attribution(UUID partnerUserId, int percentBp)>`; `GET /internal/marketplace/v1/partners/attribution?listingId=&buyerId=`.

**This is the seam the whole trade share rests on.** Task 7 stamps a partner on the trade; without
this task there is nothing to stamp from, and every trade would settle with no share.

- [ ] **Step 1: Write the migration**

```sql
-- Kim qaysi kanaldan kelgani.

-- Bosilishlar jurnali — voronkaning birinchi bosqichi.
--
-- Chegarasiz o'sadigan yagona jadval. Adminka undan AGREGAT o'qiydi,
-- qatorlarni emas, shuning uchun indeks aynan shu so'rov uchun.
CREATE TABLE partner_link_clicks (
    id                 bigserial   PRIMARY KEY,
    partner_channel_id uuid        NOT NULL REFERENCES partner_channels (id),
    kind               text        NOT NULL,
    listing_id         uuid,
    -- Kirmagan odam bosgan bo'lsa NULL. Bunday bosishni tashlab
    -- yuborish konversiyaning boshini yo'qotish demak.
    user_id            uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_partner_link_clicks_kind CHECK (kind IN ('REFERRAL', 'LISTING'))
);

CREATE INDEX idx_partner_link_clicks_funnel
    ON partner_link_clicks (partner_channel_id, created_at DESC);

-- Xaridor shu e'lonni oxirgi marta qaysi kanaldan ko'rgani.
--
-- OXIRGI BOSISH G'OLIB: bir odam bitta akkountni ikki kanalda ko'rib
-- ikkalasiga ham bossa, ikkinchisi birinchisini bosib o'tadi. Savdo
-- ochilgach esa bu jadval o'zgarishi savdoga ta'sir qilmaydi —
-- qiymat `trades` ga muhrlangan bo'ladi.
CREATE TABLE listing_partner_attributions (
    listing_id         uuid        NOT NULL,
    user_id            uuid        NOT NULL,
    partner_channel_id uuid        NOT NULL REFERENCES partner_channels (id),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (listing_id, user_id)
);
```

- [ ] **Step 2: Write the failing test**

```java
@Test
@DisplayName("a click on a listing link attributes that listing to that channel")
void recordsAttribution() {
    service.recordClick("K7M4XQP2", listing, buyer);

    var saved = captureAttribution();
    assertThat(saved.getPartnerChannelId()).isEqualTo(channel.getId());
    assertThat(saved.getListingId()).isEqualTo(listing);
    assertThat(saved.getUserId()).isEqualTo(buyer);
}

@Test
@DisplayName("the last click wins")
void lastClickWins() {
    // Bitta akkountni ikki kanalda ko'rgan odam ikkalasiga ham
    // bosishi mumkin. Ulush savdoni haqiqatan keltirgan kanalga
    // tegishli, ya'ni oxirgisiga.
    when(attributions.findById(any())).thenReturn(Optional.of(existingFor(otherChannel)));

    service.recordClick("K7M4XQP2", listing, buyer);

    assertThat(captureAttribution().getPartnerChannelId()).isEqualTo(channel.getId());
}

@Test
@DisplayName("an anonymous click is logged but attributes nothing yet")
void anonymousClickIsLoggedOnly() {
    service.recordClick("K7M4XQP2", listing, null);

    verify(clicks).save(any());
    verify(attributions, never()).save(any());
}

@Test
@DisplayName("a click through an unknown code is ignored, not an error")
void unknownCodeIgnored() {
    assertThatCode(() -> service.recordClick("NOSUCH11", listing, buyer)).doesNotThrowAnyException();
    verify(clicks, never()).save(any());
}

@Test
@DisplayName("a click on an inactive channel's link still counts")
void inactiveChannelStillCounts() {
    // Kanal yopilgan bo'lsa ham, uning eski postidan kelgan odam
    // haqiqatan o'sha kanaldan kelgan. Hisobot buni yo'qotmasligi
    // kerak; qidiruvda ko'rinmasligi boshqa masala.
    channel.setActive(false);
    service.recordClick("K7M4XQP2", listing, buyer);
    verify(clicks).save(any());
}

@Test
@DisplayName("the attribution resolves to the channel owner and the rate that applies")
void resolvesOwnerAndRate() {
    when(attributions.findById(any())).thenReturn(Optional.of(existingFor(channel)));

    var found = service.attributionFor(listing, buyer);

    assertThat(found).isPresent();
    assertThat(found.get().partnerUserId()).isEqualTo(channel.getPartnerUserId());
    assertThat(found.get().percentBp()).isEqualTo(1000);
}

@Test
@DisplayName("a buyer who arrived through no channel resolves to nothing")
void noAttribution() {
    when(attributions.findById(any())).thenReturn(Optional.empty());
    assertThat(service.attributionFor(listing, buyer)).isEmpty();
}

@Test
@DisplayName("a fixed-mode channel resolves to a zero rate rather than no attribution")
void fixedModeResolvesToZero() {
    // Attributsiya SAQLANADI — voronka uni ko'rsatadi — lekin foiz
    // nol, chunki fiks va foiz bir-birini almashtiradi.
    channel.setPayoutMode("FIXED");
    channel.setFixedMonthlySom(new BigDecimal("300000"));
    when(attributions.findById(any())).thenReturn(Optional.of(existingFor(channel)));

    assertThat(service.attributionFor(listing, buyer).orElseThrow().percentBp()).isZero();
}
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ListingAttributionServiceTest
```

Expected: compilation failure — `ListingAttributionService` does not exist.

- [ ] **Step 4: Implement**

`recordClick` resolves the code through `PartnerChannelRepository.findByLinkCode`, always writes a
`partner_link_clicks` row, and upserts `listing_partner_attributions` only when both `listingId` and
`userId` are present. `attributionFor` reads the attribution, loads the channel, and resolves the
rate through `PartnerPayoutPolicy` so `FIXED` comes back as zero.

Add the two repositories to `PartnerAdRepositories` **and** to `MarketplaceApplicationTests` — that
test mocks every repository by hand and fails the whole context if one is missing.

- [ ] **Step 5: Record the click from the proxy**

`frontend/src/proxy.ts` already extracts the code in `applyReferralCode` for the cookie. Extend that
path: when the request is for a listing page and carries `?p=`, also `POST` the click to
marketplace. Fire it without awaiting — a click log must never delay the page — and swallow its
failure.

- [ ] **Step 6: Verify the upsert against a real database**

Add to `PartnerAdSchemaIT`: write an attribution for `(listing, user)` pointing at channel A, write
another pointing at channel B, and assert the row reads back as B with one row for the pair. This is
the "last click wins" rule at the level that actually enforces it.

- [ ] **Step 7: Run everything and commit**

```bash
cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44"
cd ../../frontend && npm test && npm run build
git add backend/marketplace-service/src/ frontend/src/proxy.ts
git commit -m "feat(partners): record clicks and which channel sent a buyer to a listing

This is what the trade share is computed from. Every channel post carries
its own link, so a click identifies the channel unambiguously, and the
last click wins: somebody who saw one account in two channels belongs to
the one that actually brought them.

An anonymous click is logged even though it attributes nothing yet.
Dropping it would discard the beginning of every conversion the programme
exists to produce.

A click through a closed channel still counts. The person really did come
from there; not appearing in the picker any more is a separate matter."
```

---

### Task 7: Stamp the partner on the trade, and share the commission

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V23__trade_partner_attribution.sql`
- Modify: `backend/trade-service/.../trade/domain/Trade.java`
- Modify: `backend/trade-service/.../trade/service/TradeService.java` (stamp at open)
- Modify: `backend/trade-service/.../payment/EscrowClient.java`
- Modify: `backend/payment-service/.../wallet/service/TradeEscrowService.java`
- Modify: `backend/payment-service/.../wallet/controller/InternalTradeEscrowController.java`
- Test: `backend/payment-service/.../wallet/service/TradeEscrowPartnerShareTest.java`

`ListingAttributionService` and its `/internal` lookup were built in Task 6; this task only calls
them.

**Interfaces:**
- Produces: `Trade.partnerUserId` and `Trade.partnerPercentBp`, both `updatable = false`; `TradeEscrowService.settle(..., UUID partnerUserId, int partnerPercentBp)`.

- [ ] **Step 1: Write the failing test**

```java
@Test
@DisplayName("the partner's share comes out of the commission, not on top of it")
void shareComesOutOfCommission() {
    when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

    escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, partner, 1000);  // 10%

    var postings = capturePostings();
    assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
    assertThat(postings).contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -10_000L));
    assertThat(postings).contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -90_000L));
    // Sotuvchi oladigan summa O'ZGARMAYDI — ulush platformaning
    // hissasidan kesiladi, uning hissasidan emas.
    assertThat(postings).contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, -900_000L));
}

@Test
@DisplayName("a trade with no partner posts exactly what it posted before")
void noPartnerIsUnchanged() {
    when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

    escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, null, 0);

    assertThat(capturePostings())
            .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000L))
            .noneMatch(p -> p.account() == LedgerAccount.USER_AVAILABLE && partner.equals(p.userId()));
}

@Test
@DisplayName("a zero rate pays the partner nothing rather than a zero posting")
void zeroRatePostsNothing() {
    // chk_entry_non_zero nol yozuvni rad etadi — FIXED rejimdagi
    // hamkor aynan shu yo'ldan o'tadi.
    when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

    escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, partner, 0);

    assertThat(capturePostings())
            .noneMatch(p -> p.account() == LedgerAccount.USER_AVAILABLE && partner.equals(p.userId()));
}

@Test
@DisplayName("release pays no partner")
void releasePaysNoPartner() {
    escrow.release(tradeId, buyer, seller, 1_000_000L, 1_000_000L);
    assertThat(capturePostings())
            .noneMatch(p -> partner.equals(p.userId()));
}
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

Inside `TradeEscrowService.settle`, after `long fee = commissionService.feeTiyin(feeBaseTiyin);`:

```java
        // Ulush KOMISSIYA ICHIDAN kesiladi va o'sha tranzaksiyaning
        // o'zida yoziladi. Alohida job yo'q, kechikish yo'q, va kitob
        // hech qachon oraliq holatda qolmaydi.
        long share = (partnerUserId == null || partnerPercentBp <= 0)
                ? 0
                : fee * partnerPercentBp / 10_000L;
```

then post `PLATFORM_REVENUE, null, -(fee - share)` and, when `share > 0`,
`USER_AVAILABLE, partnerUserId, -share`.

`EscrowClient.settle` gains the two fields in its map; `SettleRequest` gains
`UUID partnerUserId` and `Integer partnerPercentBp` (nullable — old callers and replayed
requests send neither).

- [ ] **Step 3: Stamp the trade at open**

`V23__trade_partner_attribution.sql`:

```sql
-- Savdo ochilganda muhrlanadigan hamkor va stavka.
--
-- STAVKA HAM MUHRLANADI: admin ertaga foizni o'zgartirsa, ochilgan
-- savdolar eski shart bo'yicha yopilishi kerak. Faqat hamkorni
-- saqlab, foizni yopilish paytida o'qisak, kelishuv o'rtada
-- o'zgargan bo'lardi.
ALTER TABLE trades
    ADD COLUMN partner_user_id    uuid,
    ADD COLUMN partner_percent_bp integer;

ALTER TABLE trades
    ADD CONSTRAINT chk_trades_partner_bp
        CHECK (partner_percent_bp IS NULL OR (partner_percent_bp >= 0 AND partner_percent_bp <= 10000));
```

In `TradeService.openTrade`, when `listingId != null`, ask marketplace over `/internal` for the
attributed partner and the resolved rate, and set both on the `Trade` before the first save. A
failure there sets neither and logs — a trade must never fail to open because the advertising
lookup was unavailable.

- [ ] **Step 4: Run all three suites and commit**

```bash
for s in trade-service payment-service marketplace-service; do
  (cd backend/$s && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44")
done
git commit -m "feat(partners): pay the channel its share of the commission it produced

The share is posted inside the settle transaction that records the
commission, so the books balance with no payout job, no lag and nothing
to reconcile.

Both the partner and the rate are stamped when the trade opens. Stamping
only the partner would let an admin change the percentage mid-flight and
settle an open trade on terms nobody agreed to.

release() takes no commission, so there is nothing to share and the rule
'no payout on a failed trade' needs no code."
```

---

### Task 8: Payout policy and the monthly fixed payment

**Files:**
- Create: `.../partner/ads/PartnerMonthlyPayoutJob.java`
- Modify: `.../partner/AdminPartnerController.java` (global policy + per-channel override)
- Test: `.../partner/ads/PartnerPayoutPolicyTest.java`
- Test: `.../partner/ads/PartnerMonthlyPayoutJobTest.java`

**Interfaces:**
- Consumes: `PartnerPayoutPolicy.resolve` (Task 6).
- Produces: `PartnerMonthlyPayoutJob.run(YearMonth month)`.

The policy resolution itself was built in Task 6; these tests belong with it and are listed here
because they describe the payout rules rather than the attribution. Put them in
`PartnerPayoutPolicyTest` alongside Task 6's work if that task is still open.

- [ ] **Step 1: Write the failing policy test**

```java
@Test
@DisplayName("a channel with no override follows the global policy")
void followsGlobal() {
    var resolved = policy.resolve(channelWithNoOverride());
    assertThat(resolved.mode()).isEqualTo(Mode.PERCENT);
    assertThat(resolved.tradePercentBp()).isEqualTo(1000);
}

@Test
@DisplayName("an override wins over the global policy")
void overrideWins() {
    PartnerChannel c = channelWithNoOverride();
    c.setPayoutMode("FIXED");
    c.setFixedMonthlySom(new BigDecimal("300000"));

    var resolved = policy.resolve(c);
    assertThat(resolved.mode()).isEqualTo(Mode.FIXED);
    assertThat(resolved.fixedMonthlySom()).isEqualByComparingTo("300000");
}

@Test
@DisplayName("a fixed-mode channel earns no trade share")
void fixedEarnsNoShare() {
    // Ikkalasi bir-birini ALMASHTIRADI. Fiks rejimdagi hamkorga ham
    // foiz to'lansa, u boshqalardan ikki karra ko'p olardi.
    PartnerChannel c = channelWithNoOverride();
    c.setPayoutMode("FIXED");
    c.setFixedMonthlySom(new BigDecimal("300000"));

    assertThat(policy.resolve(c).tradePercentBp()).isZero();
}

@Test
@DisplayName("a partial override falls back field by field")
void partialOverride() {
    // Rejim ko'rsatilgan, foiz esa yo'q: global foiz ishlaydi.
    PartnerChannel c = channelWithNoOverride();
    c.setPayoutMode("PERCENT");

    assertThat(policy.resolve(c).tradePercentBp()).isEqualTo(1000);
}
```

- [ ] **Step 2: Write the failing monthly-job test**

```java
@Test
@DisplayName("every active fixed-mode channel is paid on the first")
void paysFixedChannels() {
    job.run(YearMonth.of(2026, 10));
    verify(payments).monthly(eq(fixedChannel.getId()), eq(fixedPartner),
            eq(new BigDecimal("300000.00")), eq("2026-10"));
}

@Test
@DisplayName("percent-mode channels are not paid monthly")
void skipsPercentChannels() {
    job.run(YearMonth.of(2026, 10));
    verify(payments, never()).monthly(eq(percentChannel.getId()), any(), any(), any());
}

@Test
@DisplayName("the first month is pro-rated by days")
void proRatesTheFirstMonth() {
    // 20-sanada tasdiqlangan hamkorga to'liq oy to'lansa, tasdiq
    // sanasini tanlash o'ynaladigan narsaga aylanardi.
    fixedChannel.setCreatedAt(LocalDate.of(2026, 9, 20).atStartOfDay(ZoneOffset.UTC).toInstant());

    job.run(YearMonth.of(2026, 10));

    // Sentyabr 30 kun, 20-sanadan keyin 11 kun qoldi.
    verify(payments).monthly(any(), any(), eq(new BigDecimal("110000.00")), any());
}

@Test
@DisplayName("a channel that closed is not paid")
void skipsInactive() {
    fixedChannel.setActive(false);
    job.run(YearMonth.of(2026, 10));
    verify(payments, never()).monthly(any(), any(), any(), any());
}

@Test
@DisplayName("one channel failing does not stop the rest")
void oneFailureDoesNotStopTheRun() {
    doThrow(new RuntimeException("payment down"))
            .when(payments).monthly(eq(fixedChannel.getId()), any(), any(), any());

    job.run(YearMonth.of(2026, 10));

    verify(payments).monthly(eq(secondFixedChannel.getId()), any(), any(), any());
}
```

- [ ] **Step 3: Implement both, then run**

The job is `@Scheduled(cron = "${app.partners.monthly-cron:0 0 4 1 * *}", zone = "UTC")` — the 1st at
04:00 UTC, following `EfhubSyncJob`'s style. Idempotency key
`partner-monthly:<channelId>:<YYYY-MM>` so a redeploy on the 1st pays once;
`LedgerService.post` returns the existing transaction on a repeated key rather than throwing, so a
retry after a timeout is safe. Direction is marketplace → payment, matching `PartnerFeeClient`; the
reverse is never introduced, because payment must not need marketplace to be up in order to settle.

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest='PartnerPayoutPolicyTest,PartnerMonthlyPayoutJobTest'
```

- [ ] **Step 4: Add the admin endpoints and commit**

`AdminPartnerController` gains `PUT /api/v1/admin/partners/settings` fields for the global policy and
`PUT /api/v1/admin/partners/channels/{channelId}/payout` for the per-channel override. Reject a
`post_price_som` outside the admin's own bounds with a 409 naming the bounds.

```bash
git commit -m "feat(partners): payout policy, per-channel overrides and the monthly payment

Fixed and percent replace each other. A fixed-mode channel resolves to a
zero trade rate, so the same settle path serves both and nobody collects
twice.

The first month is pro-rated by days. Paying a full month for ten days
would make the approval date worth gaming.

One channel's failed payout does not abort the run — they are unrelated,
and the idempotency key means the next run pays the ones that were
missed without paying anyone twice."
```

---

### Task 9: The partner panel

**Files:**
- Create: `.../partner/ads/PartnerPanelController.java`
- Create: `frontend/src/lib/partner-panel.ts`
- Create: `frontend/src/components/partners/partner-panel/price-card.tsx`
- Create: `frontend/src/components/partners/partner-panel/earnings-card.tsx`
- Create: `frontend/src/components/partners/partner-panel/posts-list.tsx`
- Modify: `frontend/src/components/partners/partner-dashboard.tsx` (replace the placeholder)
- Test: `frontend/src/lib/partner-panel.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/partners/panel -> PartnerPanelResponse(channel, priceBounds, funnel, earnings, posts)`; `PUT /api/v1/partners/panel/price { priceSom }`.

This is §7.3 of the spec, and the four blocks are exactly what it lists.

- [ ] **Step 1: Write the failing frontend test**

```ts
describe('splitEarnings', () => {
  it('keeps the three streams apart', () => {
    // Bitta umumiy raqam "narxni tushiraymi" degan savolga javob
    // bermaydi — hamkor QAYSI oqim javob berayotganini ko'rishi kerak.
    const split = splitEarnings([
      { kind: 'PARTNER_POST_SETTLE', som: 10000 },
      { kind: 'PARTNER_POST_SETTLE', som: 5000 },
      { kind: 'PARTNER_TRADE_SHARE', som: 9000 },
      { kind: 'PARTNER_MONTHLY', som: 300000 },
    ]);
    expect(split.fromPosts).toBe(15000);
    expect(split.fromTrades).toBe(9000);
    expect(split.monthly).toBe(300000);
  });

  it('reports zero rather than undefined for a stream with no entries', () => {
    const split = splitEarnings([{ kind: 'PARTNER_TRADE_SHARE', som: 9000 }]);
    expect(split.fromPosts).toBe(0);
    expect(split.monthly).toBe(0);
  });
});

describe('priceWithinBounds', () => {
  it('accepts a price inside the admin bounds', () => {
    expect(priceWithinBounds(5000, { min: 1000, max: 100000 })).toBe(true);
  });

  it('rejects one below and one above', () => {
    expect(priceWithinBounds(500, { min: 1000, max: 100000 })).toBe(false);
    expect(priceWithinBounds(200000, { min: 1000, max: 100000 })).toBe(false);
  });

  it('accepts the bounds themselves', () => {
    expect(priceWithinBounds(1000, { min: 1000, max: 100000 })).toBe(true);
    expect(priceWithinBounds(100000, { min: 1000, max: 100000 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, implement `partner-panel.ts`**

```bash
cd frontend && npm test -- partner-panel
```

- [ ] **Step 3: Build the four blocks**

Replace the `Construction` placeholder in `partner-dashboard.tsx` with:

1. **Post narxi** — a number input, the bounds shown beside it ("1 000 – 100 000 so'm"), and a save
   button. Show the bounds rather than only rejecting outside them: a partner who cannot see the
   range has to guess what the refusal meant.
2. **Kanal voronkasi** — clicks and registrations that came through this channel. **Not** the
   personal invite link: that lives on `/invite` (§7.2), and repeating it here would give the
   partner two places to copy the same code from.
3. **Daromad** — the three streams as separate figures, labelled «E'lon joylashdan», «Savdodan»,
   «Oylik».
4. **Postlar** — what went out to the channel, when, and what each earned.

Keep the existing "Xavfli hudud" section exactly where it is.

- [ ] **Step 4: Run the frontend checks and commit**

```bash
cd frontend && npm test && npm run lint && npm run build
git commit -m "feat(partners): the partner panel

Four blocks, from the spec: the posting price with the admin's bounds
shown beside it, the channel's own funnel, the three earnings streams
apart, and what has been published.

The streams are separate because they behave differently, and a partner
deciding whether to lower their price needs to see which one responds.

The funnel is the channel's, not the personal invite link. That lives on
/invite now that referrals are a platform-wide feature; repeating it here
would give a partner two places to copy the same code from."
```

---

### Task 10: The channel picker in listing creation

**Files:**
- Create: `frontend/src/lib/partner-channels.ts`
- Create: `frontend/src/components/marketplace/channel-picker.tsx`
- Create: `frontend/src/components/marketplace/channel-picker.test.ts`
- Modify: the listing creation form under `frontend/src/app/marketplace/new/`

**Interfaces:**
- Consumes: `GET /api/v1/partners/channels?q=` (Task 3).
- Produces: `<ChannelPicker selected={ids} onChange={fn} />` and `totalPrice(channels, selectedIds) -> number`.

- [ ] **Step 1: Write the failing test**

```ts
describe('totalPrice', () => {
  it('adds up only the selected channels', () => {
    const channels = [
      { channelId: 'a', priceSom: 5000 },
      { channelId: 'b', priceSom: 15000 },
      { channelId: 'c', priceSom: 1000 },
    ];
    expect(totalPrice(channels, ['a', 'b'])).toBe(20000);
  });

  it('is zero when nothing is selected', () => {
    expect(totalPrice([{ channelId: 'a', priceSom: 5000 }], [])).toBe(0);
  });

  it('ignores a selection that is no longer in the list', () => {
    // Qidiruv o'zgarganda tanlangan kanal ro'yxatdan chiqib ketishi
    // mumkin — jami summa undan qulamasligi kerak.
    expect(totalPrice([{ channelId: 'a', priceSom: 5000 }], ['a', 'gone'])).toBe(5000);
  });
});

describe('toggleChannel', () => {
  it('adds and removes', () => {
    expect(toggleChannel(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChannel(['a', 'b'], 'a')).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

The picker is a client component: a search box, a debounced fetch (the search endpoint is public to
signed-in sellers), rows showing avatar, title, subscriber count and price, a checkbox per row, and
a running total under the list. Model the debounce and the stale-response guard on
`src/components/admin/user-picker.tsx` — it already solves the out-of-order response problem with a
`requestId`.

Empty query shows the subscriber ranking; typing filters by title prefix. Both orders come from the
server, so the component does not re-sort.

- [ ] **Step 3: Wire it into the listing form and commit**

The selected ids go into `ListingCreateRequest.channelIds`. Show the total beside the submit button
so the seller sees the cost before committing.

```bash
cd frontend && npm test && npm run lint && npm run build
git commit -m "feat(marketplace): pick partner channels when publishing a listing

Empty search is the subscriber ranking; typing filters by title prefix,
still ranked by subscribers within the match. Both orders come from the
server so the list cannot disagree with itself.

A running total sits under the list. The seller is about to be charged
for a set, and the moment to see the number is before agreeing to it, not
after."
```

---

### Task 11: The admin partner analytics

**Files:**
- Modify: `.../partner/AdminPartnerController.java` (analytics endpoint)
- Create: `frontend/src/components/admin/admin-partner-analytics.tsx`
- Modify: `frontend/src/components/admin/admin-partners.tsx` (add the analytics tab)
- Test: `frontend/src/components/admin/admin-partner-analytics.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/admin/partners/analytics -> List<PartnerFunnelRow(channelId, title, subscriberCount, clicks, registrations, trades, revenueSom, postsOrdered, postsDelivered, postsFailed)>`.

- [ ] **Step 1: Write the failing test**

```ts
describe('conversionRate', () => {
  it('reads as a percentage of clicks', () => {
    expect(conversionRate({ clicks: 200, trades: 10 })).toBe('5.0%');
  });

  it('shows a dash rather than dividing by zero', () => {
    // Hech kim bosmagan kanal 0% emas, "—": nol bosishdan foiz
    // hisoblab bo'lmaydi va 0% "yomon ishlayapti" degan noto'g'ri
    // xulosa beradi.
    expect(conversionRate({ clicks: 0, trades: 0 })).toBe('—');
  });
});

describe('sortByRevenue', () => {
  it('puts the channel that earned most first', () => {
    const rows = [
      { channelId: 'a', revenueSom: 10000 },
      { channelId: 'b', revenueSom: 90000 },
    ];
    expect(sortByRevenue(rows).map((r) => r.channelId)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Implement and commit**

The table is the funnel the spec asks for: clicks → registrations → trades → revenue, per channel,
plus posting activity (ordered, delivered, failed, refunded). The funnel is the point — a channel
with many clicks and no trades is a different problem from a channel with no clicks, and one number
cannot tell them apart.

```bash
cd frontend && npm test && npm run lint && npm run build
git commit -m "feat(admin): the partner funnel

Clicks to registrations to trades to revenue, per channel. A channel with
many clicks and no trades is a different problem from one with no clicks,
and a single revenue column cannot tell an admin which they are looking
at.

A channel nobody clicked reads as a dash, not 0%. Zero clicks is no
conversion rate at all, and printing 0% would report it as failing when
it has not been tried."
```

---

## Verification before calling this done

- [ ] `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn test -DargLine="-Dapi.version=1.44"` — green
- [ ] `cd backend/payment-service && ... mvn test -DargLine="-Dapi.version=1.44"` — green
- [ ] `cd backend/trade-service && ... mvn test -DargLine="-Dapi.version=1.44"` — green
- [ ] `cd bot && ... mvn test` — green
- [ ] `cd frontend && npm test && npm run lint && npm run build` — green, build included
- [ ] `ls backend/*/src/main/resources/db/migration | sort -V | tail` shows no duplicate version
- [ ] `git status --short` still shows only `application.yml` and `crypto_vectors.json` unstaged
- [ ] No Claude attribution in any commit

## What this plan deliberately does not build

**Tiered pricing by team strength.** `PartnerPricing.priceFor(channel, listing)` takes the listing
and ignores it, so tiers change one method body and no call site.

**Automatic posting of listings nobody paid for.** The paid model replaced it: same links, same
tables, distribution the seller chooses.

**A second referral path for channel codes.** `ReferralCodeService.resolve` was extended in Task 2
rather than duplicated, so "who referred this person" has one answer in one place.
