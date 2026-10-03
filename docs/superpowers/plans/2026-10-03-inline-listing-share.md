# Inline ulashish (`@EfBazaarBot`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram'i bog'langan foydalanuvchi istalgan chatda `@EfBazaarBot` yozib, o'zining faol e'lonlarini (muqova + narx/division + coinlar/o'yinchilar) ko'radi va tanlaganini rasmiy kanal formatidagi post (katta muqova preview, kanal matni, Mini App tugmasi) sifatida yuboradi.

**Architecture:** Bot `inline_query` ni oladi va marketplace'ning ichki endpointidan tayyor elementlarni so'raydi; marketplace Telegram id'ni mavjud `AuthSummaryClient.resolveByTelegramId` bilan foydalanuvchiga aylantiradi, uning `ACTIVE` e'lonlarini filtrlaydi va har biri uchun sarlavha, tavsif, kanal matni (`ChannelPostCaption.of`), muqova `file_id` va Mini App havolasini (`ListingDeepLink`) qaytaradi. Bot ulardan `InlineQueryResultArticle` yasab `answerInlineQuery` qiladi.

**Tech Stack:** Java 21, Spring Boot 3.x, WebClient (bot), Jackson `JsonNode`, JUnit 5 + Mockito.

**Spec:** `docs/superpowers/specs/2026-10-03-inline-listing-share-design.md`

## Global Constraints

- Maven: `JAVA_HOME=~/.jdks/openjdk-21.0.2`; tekshiruv `mvn -B -ntp clean verify` (ITlar uchun `-DargLine="-Dapi.version=1.44"`). `mvn test` ITlarni o'tkazib yuboradi.
- Ichki endpoint yo'li marketplace konvensiyasida: `/internal/marketplace/v1/inline/listings` (spec'dagi `/internal/inline/listings` o'rniga — mavjud `InternalSecretFilter` va boshqa ichki yo'llar shu prefiksda). `X-Internal-Secret` majburiy.
- Kimlik faqat Telegram `from.id` dan. Javobda telefon/email yo'q.
- Natijalar: `is_personal=true`, `cache_time=10`; xatoda `cache_time=0`. Sahifa 20 ta.
- Matn — rasmiy kanal matni (`ChannelPostCaption.of(listing, deepLink.webUrl(id, null))`), tugma — `deepLink.buttonUrl(id, null)`, tugma matni `🛒 E'lonni ochish`.
- Mini App sahifalari bot'da mavjud naqsh bilan: `app.web.base-url` + `/profile`, `/marketplace/new`, `/marketplace`.
- Muqova URL: `app.web.base-url` + `/bot/photo/{fileId}`.
- Commit xabarlariga Claude imzosi / Co-Authored-By qo'shilmaydi.
- README: endpoint/update turi o'zgargan commit'da `bot/README.md` va `backend/marketplace-service/README.md` yangilanadi.

## Review Focus

- Boshqa foydalanuvchining yoki `SOLD`/`DELETED`/`BLOCKED` e'lon natijaga tushmasligi (Task 1 testlari).
- `allowed_updates` ga `inline_query` qo'shilmasa bot inline so'rovlarni umuman olmaydi — webhook va long-polling ikkalasida (Task 3 testi).
- marketplace sekin/yiqilgan bo'lsa inline javob baribir 1,5 s ichida qaytadi va kesh 0 bo'ladi (Task 4 testi).
- HTML matndagi maxsus belgilar: `captionHtml` allaqachon kanal uchun escape qilingan; `title`/`description` oddiy matn (escape kerak emas, lekin `null`/bo'sh atributlar "null" bo'lib chiqmasin — Task 1 testi).
- Natija `id` 64 baytdan oshmasligi (UUID 36) va `next_offset` faqat keyingi sahifa bo'lganda berilishi (Task 1, Task 4).

---

### Task 1: marketplace — InlineListingService

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/partner/ads/ChannelPostCaption.java` (public `plainPlayers` yordamchisi)
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/inline/InlineListingService.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/inline/InlineListingServiceTest.java`

**Interfaces:**
- Produces:
  ```java
  public record InlineListingItem(UUID listingId, String title, String description,
                                  String captionHtml, String coverFileId, String buttonUrl) {}
  public record InlinePage(boolean linked, List<InlineListingItem> items, Integer nextOffset) {}
  public InlinePage InlineListingService.find(long telegramId, String query, int offset)
  public static String ChannelPostCaption.plainPlayers(Map<String, Object> attributes, int limit)
  ```
  (`InlineListingItem` va `InlinePage` — `InlineListingService` ichidagi nested record'lar.)

- [ ] **Step 1: Yiqiluvchi testlar**

`InlineListingServiceTest.java` (Mockito, DB'siz; `ListingRepository`, `AuthSummaryClient` mock, `ListingDeepLink` haqiqiy: `new ListingDeepLink("https://efbazaar.uz", "https://t.me/EfBazaarBot/app")`):
```java
package uz.efbazaar.marketplace.inline;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.ads.ChannelPostCaption;
import uz.efbazaar.marketplace.partner.ads.ListingDeepLink;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class InlineListingServiceTest {

    static final UUID SELLER = UUID.randomUUID();
    final ListingRepository listings = mock(ListingRepository.class);
    final AuthSummaryClient auth = mock(AuthSummaryClient.class);
    final ListingDeepLink deepLink = new ListingDeepLink("https://efbazaar.uz", "https://t.me/EfBazaarBot/app");
    final InlineListingService service = new InlineListingService(listings, auth, deepLink);

    static Listing listing(String price, Map<String, Object> attrs, List<String> media) {
        return Listing.builder().id(UUID.randomUUID()).sellerId(SELLER).description("Zo'r akkount")
                .price(new BigDecimal(price)).attributes(new HashMap<>(attrs))
                .mediaMessageIds(new ArrayList<>(media)).status(ListingStatus.ACTIVE)
                .createdAt(Instant.now()).build();
    }

    static Map<String, Object> attrs() {
        return Map.of("highest_division_level", 1, "ios_coins", 1200, "android_coins", 800,
                "team_strength", 3245, "valuable_players", List.of("Messi", "Neymar", "Mbappé", "Kaká"));
    }

    void linked() {
        when(auth.resolveByTelegramId(42L)).thenReturn(Optional.of(
                new AuthSummaryClient.UserSummary(SELLER, "Aziz", "aziz", 42L, /* see record */ null)));
    }

    @Test
    void anUnlinkedTelegramAccountGetsNothingAndIsToldSo() {
        when(auth.resolveByTelegramId(42L)).thenReturn(Optional.empty());
        var page = service.find(42L, "", 0);
        assertThat(page.linked()).isFalse();
        assertThat(page.items()).isEmpty();
        verifyNoInteractions(listings);
    }

    @Test
    void onlyTheSellersActiveListingsAreAsked() {
        linked();
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(List.of());
        assertThat(service.find(42L, "", 0).linked()).isTrue();
        verify(listings).findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE);
        verifyNoMoreInteractions(listings);
    }

    @Test
    void anItemCarriesTheChannelCaptionCoverAndMiniAppButton() {
        linked();
        Listing l = listing("2500000", attrs(), List.of("FILE_COVER", "FILE_2"));
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(List.of(l));

        var item = service.find(42L, "", 0).items().get(0);

        assertThat(item.listingId()).isEqualTo(l.getId());
        assertThat(item.title()).isEqualTo("2 500 000 so'm · Division 1");
        assertThat(item.description()).isEqualTo("iOS 1200 · Android 800 · Kuch 3245\nMessi, Neymar, Mbappé");
        assertThat(item.captionHtml()).isEqualTo(ChannelPostCaption.of(l, deepLink.webUrl(l.getId(), null)));
        assertThat(item.coverFileId()).isEqualTo("FILE_COVER");
        assertThat(item.buttonUrl()).isEqualTo(deepLink.buttonUrl(l.getId(), null));
    }

    @Test
    void missingAttributesDoNotPrintNull() {
        linked();
        Listing l = listing("850000", Map.of(), List.of());
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(List.of(l));
        var item = service.find(42L, "", 0).items().get(0);
        assertThat(item.title()).isEqualTo("850 000 so'm");
        assertThat(item.description()).doesNotContain("null");
        assertThat(item.coverFileId()).isNull();
    }

    @Test
    void theQueryMatchesPlayersOrDescriptionCaseInsensitively() {
        linked();
        Listing messi = listing("1", attrs(), List.of());
        Listing other = listing("2", Map.of("valuable_players", List.of("Haaland")), List.of());
        other.setDescription("Ronaldo ham bor");
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(List.of(messi, other));

        assertThat(service.find(42L, "MESSI", 0).items()).extracting("listingId").containsExactly(messi.getId());
        assertThat(service.find(42L, "ronaldo", 0).items()).extracting("listingId").containsExactly(other.getId());
    }

    @Test
    void pagesAreTwentyWithANextOffsetOnlyWhenMoreRemain() {
        linked();
        List<Listing> many = IntStream.range(0, 45).mapToObj(i -> listing("1000", Map.of(), List.of())).toList();
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(many);

        assertThat(service.find(42L, "", 0).items()).hasSize(20);
        assertThat(service.find(42L, "", 0).nextOffset()).isEqualTo(20);
        assertThat(service.find(42L, "", 40).items()).hasSize(5);
        assertThat(service.find(42L, "", 40).nextOffset()).isNull();
        assertThat(service.find(42L, "", 99).items()).isEmpty();
    }
}
```
`linked()` dagi `UserSummary` konstruktorini `AuthSummaryClient.UserSummary` record'ining haqiqiy imzosiga moslang (`id, displayName, telegramUsername, telegramId, …` — faylni o'qing); assertion'lar o'zgarmaydi. `Listing` builder maydon nomlari (`attributes`, `mediaMessageIds`, `status`, `createdAt`) `domain/Listing.java` dan; setter yo'q bo'lsa `description` ni builder orqali bering.

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=InlineListingServiceTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: kompilyatsiya xatosi (`InlineListingService` yo'q).

- [ ] **Step 3: `ChannelPostCaption.plainPlayers`**

`ChannelPostCaption.java` ga (mavjud `players`/`playerName` yonida, HTML escape QILMAYDI):
```java
    /** O'yinchi nomlari oddiy matn sifatida (inline natija tavsifi uchun) — HTML escape yo'q. */
    public static String plainPlayers(Map<String, Object> attributes, int limit) {
        Object raw = attributes == null ? null : attributes.get("valuable_players");
        if (!(raw instanceof Collection<?> collection) || collection.isEmpty()) return "";
        return collection.stream().map(ChannelPostCaption::playerName)
                .filter(s -> !s.isBlank()).limit(limit)
                .collect(java.util.stream.Collectors.joining(", "));
    }
```

- [ ] **Step 4: Servis**

`InlineListingService.java`:
```java
package uz.efbazaar.marketplace.inline;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.ads.ChannelPostCaption;
import uz.efbazaar.marketplace.partner.ads.ListingDeepLink;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.*;

/**
 * A seller's own active listings, shaped for Telegram inline mode
 * (`@EfBazaarBot` in any chat). Identity comes only from the Telegram user id
 * Telegram itself attached to the inline query; the query text only filters.
 * The post text and button are the official channel's, so a shared post looks
 * exactly like the channel one.
 */
@Service
@RequiredArgsConstructor
public class InlineListingService {

    static final int PAGE = 20;
    private static final int PLAYERS_IN_DESCRIPTION = 3;

    private final ListingRepository listings;
    private final AuthSummaryClient auth;
    private final ListingDeepLink deepLink;

    public record InlineListingItem(UUID listingId, String title, String description,
                                    String captionHtml, String coverFileId, String buttonUrl) {}

    public record InlinePage(boolean linked, List<InlineListingItem> items, Integer nextOffset) {}

    @Transactional(readOnly = true)
    public InlinePage find(long telegramId, String query, int offset) {
        Optional<AuthSummaryClient.UserSummary> user = auth.resolveByTelegramId(telegramId);
        if (user.isEmpty()) return new InlinePage(false, List.of(), null);

        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<Listing> matching = listings
                .findBySellerIdAndStatusOrderByCreatedAtDesc(user.get().id(), ListingStatus.ACTIVE)
                .stream().filter(l -> q.isEmpty() || matches(l, q)).toList();

        int from = Math.max(0, offset);
        if (from >= matching.size()) return new InlinePage(true, List.of(), null);
        int to = Math.min(matching.size(), from + PAGE);
        List<InlineListingItem> items = matching.subList(from, to).stream().map(this::item).toList();
        return new InlinePage(true, items, to < matching.size() ? to : null);
    }

    private static boolean matches(Listing l, String q) {
        String players = ChannelPostCaption.plainPlayers(l.getAttributes(), Integer.MAX_VALUE);
        return players.toLowerCase(Locale.ROOT).contains(q)
                || (l.getDescription() != null && l.getDescription().toLowerCase(Locale.ROOT).contains(q));
    }

    private InlineListingItem item(Listing l) {
        Map<String, Object> a = l.getAttributes() == null ? Map.of() : l.getAttributes();
        List<String> media = l.getMediaMessageIds();
        return new InlineListingItem(
                l.getId(),
                title(l.getPrice(), a.get("highest_division_level")),
                description(a),
                ChannelPostCaption.of(l, deepLink.webUrl(l.getId(), null)),
                media == null || media.isEmpty() ? null : media.get(0),
                deepLink.buttonUrl(l.getId(), null));
    }

    static String title(BigDecimal price, Object division) {
        DecimalFormatSymbols s = new DecimalFormatSymbols(Locale.ROOT);
        s.setGroupingSeparator(' ');
        String money = new DecimalFormat("#,##0", s).format(price == null ? BigDecimal.ZERO : price) + " so'm";
        return division == null ? money : money + " · Division " + division;
    }

    static String description(Map<String, Object> a) {
        List<String> parts = new ArrayList<>();
        if (a.get("ios_coins") != null) parts.add("iOS " + a.get("ios_coins"));
        if (a.get("android_coins") != null) parts.add("Android " + a.get("android_coins"));
        if (a.get("team_strength") != null) parts.add("Kuch " + a.get("team_strength"));
        String players = ChannelPostCaption.plainPlayers(a, PLAYERS_IN_DESCRIPTION);
        String first = String.join(" · ", parts);
        if (players.isEmpty()) return first;
        return first.isEmpty() ? players : first + "\n" + players;
    }
}
```

- [ ] **Step 5: O'tishini tekshirish** — Step 2 buyrug'i → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): inline ulashish uchun o'z faol e'lonlari xizmati"
```

---

### Task 2: marketplace — ichki endpoint va README

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/inline/InternalInlineController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/inline/InternalInlineControllerTest.java`
- Modify: `backend/marketplace-service/README.md`

**Interfaces:**
- Consumes: `InlineListingService.find`.
- Produces: `GET /internal/marketplace/v1/inline/listings?telegramId={long}&q={string?}&offset={int=0}` → `InlinePage` JSON `{"linked", "items":[{"listingId","title","description","captionHtml","coverFileId","buttonUrl"}], "nextOffset"}`.

- [ ] **Step 1: Yiqiluvchi test** — `InternalAccountControllerTest` uslubida (kontroller mock servis bilan to'g'ridan-to'g'ri chaqiriladi):
```java
class InternalInlineControllerTest {
    final InlineListingService service = mock(InlineListingService.class);
    final InternalInlineController controller = new InternalInlineController(service);

    @Test
    void passesTelegramIdQueryAndOffsetThrough() {
        var page = new InlineListingService.InlinePage(true, List.of(), null);
        when(service.find(42L, "messi", 20)).thenReturn(page);
        assertThat(controller.listings(42L, "messi", 20)).isSameAs(page);
    }

    @Test
    void missingQueryAndOffsetDefault() {
        when(service.find(42L, "", 0)).thenReturn(new InlineListingService.InlinePage(false, List.of(), null));
        assertThat(controller.listings(42L, null, null).linked()).isFalse();
    }
}
```
Qo'shimcha: `/internal/**` `X-Internal-Secret` siz 401 bo'lishini mavjud `InternalSecretFilter` testlaridan biri allaqachon tekshirsa — shu testga yangi yo'l bilan bitta holat qo'shing (`grep -rn InternalSecretFilter src/test`); topilmasa, `InternalSecretFilter` ni to'g'ridan-to'g'ri `MockHttpServletRequest` bilan chaqirib `/internal/marketplace/v1/inline/listings` uchun 401 ni tekshiradigan unit test yozing.

- [ ] **Step 2: Yiqilishini tekshirish** — `mvn -q test -Dtest='InternalInlineControllerTest'` → kompilyatsiya xatosi.

- [ ] **Step 3: Kontroller**
```java
package uz.efbazaar.marketplace.inline;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** Telegram inline mode for the bot. Behind InternalSecretFilter like every /internal/** path. */
@RestController
@RequestMapping("/internal/marketplace/v1/inline")
@RequiredArgsConstructor
public class InternalInlineController {

    private final InlineListingService service;

    @GetMapping("/listings")
    public InlineListingService.InlinePage listings(@RequestParam long telegramId,
                                                    @RequestParam(required = false) String q,
                                                    @RequestParam(required = false) Integer offset) {
        return service.find(telegramId, q == null ? "" : q, offset == null ? 0 : offset);
    }
}
```

- [ ] **Step 4: O'tishini tekshirish** — Step 2 → PASS.

- [ ] **Step 5: README** — `backend/marketplace-service/README.md` dagi ichki endpointlar jadvaliga: `GET /internal/marketplace/v1/inline/listings?telegramId&q&offset` — bot (inline ulashish): foydalanuvchining o'z ACTIVE e'lonlari, kanal matni, muqova, Mini App havolasi; 20 talik sahifa.

- [ ] **Step 6: To'liq tekshiruv va commit**

```bash
cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"
cd ../.. && git add backend/marketplace-service && git commit -m "feat(marketplace): inline e'lonlar uchun ichki endpoint"
```
Expected: BUILD SUCCESS, Surefire va Failsafe hisobotlarida failure 0.

---

### Task 3: bot — `answerInlineQuery` va `allowed_updates`

**Files:**
- Modify: `bot/src/main/java/uz/efbazaar/bot/telegram/TelegramApiClient.java` (`allowedUpdates()` va yangi `answerInlineQuery`)
- Test: `bot/src/test/java/uz/efbazaar/bot/telegram/TelegramApiClientInlineTest.java`

**Interfaces:**
- Produces:
  - `static List<String> TelegramApiClient.ALLOWED_UPDATES` = `message, callback_query, my_chat_member, inline_query` (`allowedUpdates()` shundan yasaladi).
  - `public void answerInlineQuery(String inlineQueryId, ArrayNode results, int cacheTime, boolean isPersonal, String nextOffset, ObjectNode button)` — `nextOffset`/`button` `null` bo'lsa maydon yuborilmaydi.
  - Natija JSON'larini handler o'zining `ObjectMapper` i bilan yasaydi (client'ning mapper'i ochilmaydi).

- [ ] **Step 1: Yiqiluvchi test**

`TelegramApiClient` HTTP qismini sinash uchun mavjud naqsh bo'lsa (`grep -rn "MockWebServer\|ExchangeFunction" src/test`) — o'shandan foydalaning; bo'lmasa `WebClient.builder().exchangeFunction(req -> { captured.set(req); return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type","application/json").body("{\"ok\":true,\"result\":true}").build()); })` bilan client yasab, so'rov tanasini o'qing. Testlar:
```java
@Test void inlineQueryIsAmongAllowedUpdates() {
    assertThat(TelegramApiClient.ALLOWED_UPDATES)
        .containsExactly("message", "callback_query", "my_chat_member", "inline_query");
}
@Test void answerInlineQuerySendsPersonalCachedResultsWithOffsetAndButton() { … body: inline_query_id, results, cache_time=10, is_personal=true, next_offset="20", button.text/web_app.url … }
@Test void answerInlineQueryOmitsNullOffsetAndButton() { … body has no next_offset and no button … }
```

- [ ] **Step 2: Yiqilishini tekshirish** — `cd bot && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=TelegramApiClientInlineTest` → kompilyatsiya xatosi.

- [ ] **Step 3: Amalga oshirish** — `allowedUpdates()` ni `ALLOWED_UPDATES` dan yasang (izohga `inline_query` sababini qo'shing: ro'yxat berilgach sanalmagan tur kelmaydi); `answerInlineQuery` mavjud `postJson("answerInlineQuery", body)` orqali.

- [ ] **Step 4: O'tishini tekshirish** — Step 2 → PASS.

- [ ] **Step 5: Commit** — `git add bot/src && git commit -m "feat(bot): answerInlineQuery va inline_query update turi"`

---

### Task 4: bot — inline so'rov handler'i, marketplace client'i, dispatch va README

**Files:**
- Create: `bot/src/main/java/uz/efbazaar/bot/inline/InlineListingClient.java`, `bot/src/main/java/uz/efbazaar/bot/inline/InlineQueryHandler.java`
- Modify: `bot/src/main/java/uz/efbazaar/bot/telegram/UpdateHandler.java` (dispatch), mavjud UpdateHandler testlarining konstruktor chaqiruvlari, `bot/README.md`
- Test: `bot/src/test/java/uz/efbazaar/bot/inline/InlineQueryHandlerTest.java`, `bot/src/test/java/uz/efbazaar/bot/telegram/UpdateHandlerInlineTest.java`

**Interfaces:**
- Consumes: Task 3 `answerInlineQuery`, `ALLOWED_UPDATES`; marketplace endpoint (Task 2).
- Produces:
  - `InlineListingClient.find(long telegramId, String q, int offset) -> Optional<InlinePage>` — `Optional.empty()` xato/timeout (1,5 s) yoki secret yo'q bo'lsa; `record InlinePage(boolean linked, List<Item> items, Integer nextOffset)`, `record Item(String listingId, String title, String description, String captionHtml, String coverFileId, String buttonUrl)` (`@JsonIgnoreProperties(ignoreUnknown = true)`). `marketplaceWebClient` va `BotSettingsProperties.secret()` — `BotSettingsClient` naqshida.
  - `InlineQueryHandler.handle(JsonNode inlineQuery)`.

- [ ] **Step 1: Yiqiluvchi testlar**

`InlineQueryHandlerTest` (Mockito: `InlineListingClient`, `TelegramApiClient`; `ArgumentCaptor<ArrayNode>` va `ArgumentCaptor<ObjectNode>`; base URL `https://efbazaar.uz`):
1. Element → maqola natijasi: `type="article"`, `id=listingId`, `title`, `description`, `thumbnail_url="https://efbazaar.uz/bot/photo/FILE_COVER"`, `input_message_content.message_text=captionHtml`, `parse_mode="HTML"`, `link_preview_options={url: thumbnail_url, prefer_large_media: true, show_above_text: true}`, `reply_markup.inline_keyboard[0][0]={text:"🛒 E'lonni ochish", url: buttonUrl}`; `answerInlineQuery(id, results, 10, true, "20"/null, null)`.
2. `coverFileId=null` → `thumbnail_url` yo'q, `link_preview_options.is_disabled=true`.
3. `captionHtml` 4096 dan uzun → `message_text` 4096 belgidan oshmaydi.
4. `linked=false` → bo'sh natija, `button={text:"Telegram'ni efBazaar'ga bog'lash", web_app:{url:"https://efbazaar.uz/profile"}}`, `cache_time=10`.
5. `linked=true`, natija bo'sh, `query` bo'sh, `offset` bo'sh → `button` "E'lon joylash" → `/marketplace/new`.
6. `linked=true`, natija bo'sh, `query="xyz"` → tugma yo'q (qidiruv natijasizligi — tugma kerak emas).
7. Client `Optional.empty()` → bo'sh natija, `button` "Hozir e'lonlarni olib bo'lmadi — qayta urinib ko'ring" → `/marketplace`, `cache_time=0`.
8. `from.id` yo'q yoki `offset` raqam emas → so'rov baribir javoblanadi (bo'sh natija, `cache_time=0`), istisno tashlanmaydi.

`UpdateHandlerInlineTest`: `{"inline_query": {...}}` update'i `InlineQueryHandler.handle` ga boradi va `message` mantiqiga tegmaydi.

- [ ] **Step 2: Yiqilishini tekshirish** — `mvn -q test -Dtest='InlineQueryHandlerTest,UpdateHandlerInlineTest'` → kompilyatsiya xatosi.

- [ ] **Step 3: `InlineListingClient`**
```java
package uz.efbazaar.bot.inline;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/** marketplace's inline listings endpoint. Empty on any failure: inline mode must answer fast. */
@Slf4j
@Component
@RequiredArgsConstructor
public class InlineListingClient {

    static final Duration TIMEOUT = Duration.ofMillis(1500);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(String listingId, String title, String description,
                       String captionHtml, String coverFileId, String buttonUrl) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record InlinePage(boolean linked, List<Item> items, Integer nextOffset) {}

    public Optional<InlinePage> find(long telegramId, String q, int offset) {
        if (props.secret() == null || props.secret().isBlank()) return Optional.empty();
        try {
            return Optional.ofNullable(marketplaceWebClient.get()
                    .uri(u -> u.path("/internal/marketplace/v1/inline/listings")
                            .queryParam("telegramId", telegramId)
                            .queryParam("q", q)
                            .queryParam("offset", offset).build())
                    .header("X-Internal-Secret", props.secret())
                    .retrieve()
                    .bodyToMono(InlinePage.class)
                    .timeout(TIMEOUT)
                    .block());
        } catch (Exception e) {
            log.warn("Inline e'lonlarni olib bo'lmadi: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
```
(`marketplaceWebClient` bean nomi va `BotSettingsProperties` — `BotSettingsClient` dagidek; farq bo'lsa o'shaga moslang. Interfeysda `offset` — `int`, handler satrni xavfsiz `int` ga aylantiradi.)

- [ ] **Step 4: `InlineQueryHandler`**

Mas'uliyat: `inline_query` JSON'dan `id`, `from.id`, `query`, `offset` ni olish (noto'g'ri `offset` → 0); `client.find`; natijalarni `ObjectMapper` bilan yasash (Step 1 dagi shakllar); tugma holatlari; `telegram.answerInlineQuery(...)`. Konstantalar: `CACHE_SECONDS = 10`, `MAX_TEXT = 4096`, tugma matnlari Step 1 dagidek. `@Value("${app.web.base-url:https://efbazaar.uz}")` — `UpdateHandler.url()` dagi kabi oxirgi `/` ni olib tashlab yo'l qo'shiladi. Har qanday istisno ushlanadi: log WARN va bo'sh javob `cache_time=0` (inline so'rov javobsiz qolmasin).

- [ ] **Step 5: Dispatch**

`UpdateHandler` konstruktoriga `InlineQueryHandler inline` (oxirgi parametr), `handle()` boshida (`my_chat_member` tekshiruvidan keyin):
```java
        JsonNode inlineQuery = update.path("inline_query");
        if (!inlineQuery.isMissingNode()) {
            inline.handle(inlineQuery);
            return;
        }
```
Mavjud testlardagi `new UpdateHandler(...)` chaqiruvlariga `mock(InlineQueryHandler.class)` qo'shing.

- [ ] **Step 6: O'tishini tekshirish** — Step 2 buyrug'i → PASS.

- [ ] **Step 7: README** — `bot/README.md`: "Inline rejim" bo'limi — `@EfBazaarBot` inline so'rovi, marketplace endpointi, natija shakli (maqola, muqova preview, Mini App tugmasi), `allowed_updates` ga `inline_query` qo'shilgani, BotFather'da `/setinline` yoqilganligi sharti; ichki API jadvaliga bot → marketplace chaqiruvi.

- [ ] **Step 8: To'liq tekshiruv va commit**

```bash
cd bot && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"
cd .. && git diff --check && git add bot && git commit -m "feat(bot): @EfBazaarBot inline — o'z e'lonlarini ulashish"
```
Expected: BUILD SUCCESS, failure 0.
