package uz.efbazaar.trade.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uz.efbazaar.trade.mailbox.custom.CustomMailboxService;
import uz.efbazaar.trade.mailbox.domain.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.*;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class UnifiedMailboxQuotaIT extends uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT {
    @Autowired uz.efbazaar.trade.kafka.EmailProvisionedConsumer provisioned;
    @Autowired MailboxSlotService slots;
    @Autowired CustomSlotService customSlots;
    @Autowired MailboxAccessService access;
    @Autowired CustomMailboxService custom;
    @Autowired MailboxRepository mailboxes;
    @Autowired MailboxService service;
    @Autowired PlanProjection projection;
    @Autowired jakarta.persistence.EntityManager entityManager;
    @Autowired uz.efbazaar.trade.trade.service.TradeService trades;
    @Autowired uz.efbazaar.trade.trade.repository.TradeRepository tradeRows;
    @Autowired uz.efbazaar.trade.trade.service.TradeSideService sides;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager tx;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;

    @org.junit.jupiter.api.AfterEach void cleanup() {
        jdbc.update("DELETE FROM plan_entitlement_view");
        jdbc.update("DELETE FROM user_plan_view");
    }

    private void free(UUID user) {
        projection.replacePlan("STANDARD", Map.of("mailbox.total_slots", "3", "mailbox.custom_slots", "0"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        projection.userMoved(user, "STANDARD", null, System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
    }

    private UUID open(UUID seller, UUID buyer, uz.efbazaar.trade.trade.domain.TradeKind kind) {
        return trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null, UUID.randomUUID(), null,
                uz.efbazaar.trade.trade.domain.TradeMode.SMART, null, null, kind, 500_000L).id();
    }

    private uz.efbazaar.trade.trade.domain.Trade pending(UUID seller, UUID buyer,
            uz.efbazaar.trade.trade.domain.TradeKind kind, UUID sellerBox, UUID buyerBox) {
        var trade = tradeRows.saveAndFlush(uz.efbazaar.trade.trade.domain.Trade.builder().id(UUID.randomUUID())
                .sellerId(seller).buyerId(buyer).kind(kind).mailboxId(sellerBox)
                .state(uz.efbazaar.trade.trade.domain.TradeState.WAITING_BUYER_VERIFY)
                .expiresAt(Instant.now().plusSeconds(3600)).build());
        sides.open(trade.getId(), sellerBox, buyerBox);
        return trade;
    }

    private UUID pro() {
        UUID user = UUID.randomUUID();
        projection.replacePlan("PRO", Map.of("mailbox.total_slots", "10", "mailbox.custom_slots", "2"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        projection.userMoved(user, "PRO", Instant.now().plusSeconds(3600), System.nanoTime(),
                "fixture-" + UUID.randomUUID(), Instant.now());
        return user;
    }

    private UUID box(UUID owner, MailboxKind kind, long priority) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("quota-" + id + "@efbazaar.uz")
                .ownerUserId(owner).kind(kind).source(MailboxSource.USER)
                .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
                .provisionedAt(Instant.now()).accessPriority(priority).build());
        return id;
    }

    private void boxes(UUID user, int random, int custom) {
        for (int i = 0; i < random; i++) box(user, MailboxKind.RANDOM, i + 10);
        for (int i = 0; i < custom; i++) box(user, MailboxKind.CUSTOM, i + 1);
    }

    @Autowired EntitlementService entitlements;
    @Autowired MailboxQuotaLock quota;
    @Autowired uz.efbazaar.trade.mailbox.config.MailboxDomains domains;

    @Test void customClaimCannotCombineLimitsFromDifferentPolicyVersions() {
        UUID user = pro();
        boxes(user, 1, 0);
        projection.replacePlan("PRO", Map.of("mailbox.total_slots", "1", "mailbox.custom_slots", "2"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        var countedCustom = org.mockito.Mockito.spy(new CustomSlotService(entitlements, mailboxes));
        var updated = new java.util.concurrent.atomic.AtomicBoolean();
        org.mockito.Mockito.doAnswer(invocation -> {
            long used = (long) invocation.callRealMethod();
            // Publish an atomic catalog edit after the custom budget has been
            // read, before the legacy path reads its independent total budget.
            if (updated.compareAndSet(false, true)) {
                var publish = new org.springframework.transaction.support.TransactionTemplate(tx);
                publish.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
                publish.executeWithoutResult(status -> projection.replacePlan("PRO",
                        Map.of("mailbox.total_slots", "10", "mailbox.custom_slots", "0"),
                        System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now()));
            }
            return used;
        }).when(countedCustom).used(user);
        var claim = new CustomMailboxService(mailboxes, domains, countedCustom, slots, quota, entitlements, events);
        var allocation = new org.springframework.transaction.support.TransactionTemplate(tx);
        assertThatThrownBy(() -> allocation.execute(status -> claim.claim(user, "policyversion", null)))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        error -> assertThat(error.getCode()).isEqualTo("no_slot"));
        assertThat(updated).isTrue();
        assertThat(customSlots.used(user)).isZero();
        assertThat(slots.used(user)).isEqualTo(1);
    }

    @Test void tenRandomBoxesUseTheWholeProPool() {
        UUID user = pro(); boxes(user, 10, 0);
        assertThat(slots.used(user)).isEqualTo(10);
        assertThat(slots.statusFor(user).full()).isTrue();
        assertThatThrownBy(() -> slots.assertCanAllocate(user))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }
    @Test void eightRandomAndTwoCustomUseTheWholeProPool() {
        UUID user = pro(); boxes(user, 8, 2);
        assertThat(slots.used(user)).isEqualTo(10);
        assertThatThrownBy(() -> slots.assertCanAllocate(user))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }
    @Test void nineRandomAndOneCustomBlockAnotherCustom() {
        UUID user = pro(); boxes(user, 9, 1);
        assertThat(custom.availability(user, "quotafull", null).canClaim()).isFalse();
        assertThat(custom.availability(user, "quotafull", null).claimBlock()).isEqualTo("NO_SLOT");
    }
    @Test void sevenRandomAndTwoCustomCannotCreateAThirdCustom() {
        UUID user = pro(); boxes(user, 7, 2);
        assertThat(slots.used(user)).isEqualTo(9);
        assertThat(custom.availability(user, "quotathird", null).claimBlock()).isEqualTo("NO_SLOT");
    }
    @Test void detachDoesNotFreeARealMailboxResource() {
        UUID user = pro(); UUID mailbox = box(user, MailboxKind.RANDOM, 1);
        service.detachOwnedBy(user, mailbox);
        assertThat(mailboxes.findById(mailbox).orElseThrow().getOwnerUserId()).isNull();
        assertThat(slots.used(user)).isEqualTo(1);
        assertThatThrownBy(() -> service.deleteUnheld(mailbox))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void freeDowngradeUsesOnePoolAndAllowsCrossKindUnlock() {
        UUID user = pro();
        UUID oldCustom = box(user, MailboxKind.CUSTOM, 1);
        box(user, MailboxKind.RANDOM, 2); box(user, MailboxKind.RANDOM, 3);
        UUID newestRandom = box(user, MailboxKind.RANDOM, 4);
        projection.replacePlan("STANDARD", Map.of("mailbox.total_slots", "3", "mailbox.custom_slots", "0"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        projection.userMoved(user, "STANDARD", null, System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        assertThat(access.excessIds(user)).containsExactly(oldCustom);
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(access.metadata(user, oldCustom).accessState()).isEqualTo(MailboxAccessService.AccessState.GRACE);
        assertThat(access.metadata(user, oldCustom).selectedForFree()).isFalse();
        assertThat(access.metadata(user, newestRandom).selectedForFree()).isTrue();
        service.swapAccess(user, oldCustom, newestRandom);
        assertThat(access.excessIds(user)).containsExactly(newestRandom);
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(access.metadata(user, oldCustom).accessState()).isEqualTo(MailboxAccessService.AccessState.ACTIVE);
        assertThat(access.metadata(user, oldCustom).selectedForFree()).isTrue();
        assertThat(access.metadata(user, newestRandom).accessState()).isEqualTo(MailboxAccessService.AccessState.GRACE);
        assertThat(access.metadata(user, newestRandom).selectedForFree()).isFalse();
        assertThat(slots.used(user)).isEqualTo(4);
        assertThat(slots.statusFor(user).limit()).isEqualTo(3);
        assertThat(slots.statusFor(user).full()).isTrue();
        assertThatThrownBy(() -> slots.assertCanAllocate(user))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
        assertThat(service.getReadable(user, oldCustom).getId()).isEqualTo(oldCustom);
        assertThatThrownBy(() -> service.getReadable(UUID.randomUUID(), oldCustom))
                .isInstanceOf(jakarta.persistence.EntityNotFoundException.class);
    }
    @Test void legacyRandomGrantCannotSubstituteForMissingPaidTotal() {
        UUID user = pro();
        projection.replacePlan("PRO", Map.of("mailbox.slots", "10", "mailbox.custom_slots", "2"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        assertThatThrownBy(() -> slots.assertCanAllocate(user))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
    }

    @Test void fourthFreeResourceIsRejectedAcrossKinds() {
        UUID user = UUID.randomUUID(); free(user); boxes(user, 2, 1);
        assertThatThrownBy(() -> open(user, UUID.randomUUID(), uz.efbazaar.trade.trade.domain.TradeKind.SALE))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }
    @Test void saleReservesTheRecipientCapacityToo() {
        UUID seller = pro(), buyer = pro(); boxes(buyer, 10, 0);
        assertThatThrownBy(() -> open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
        assertThat(slots.used(seller)).isZero();
        UUID roomyBuyer = pro();
        open(seller, roomyBuyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE);
        assertThat(slots.used(seller)).isEqualTo(1);
        assertThat(slots.used(roomyBuyer)).isEqualTo(1);
    }
    @Test void swapNeedsOneLastSlotPerPartyAndPreventsAnotherReservation() {
        UUID seller = pro(), buyer = pro(); boxes(seller, 9, 0); boxes(buyer, 8, 1);
        open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP);
        assertThat(slots.used(seller)).isEqualTo(10);
        assertThat(slots.used(buyer)).isEqualTo(10);
        assertThatThrownBy(() -> open(buyer, seller, uz.efbazaar.trade.trade.domain.TradeKind.SWAP))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }
    @Test void parallelRandomAndCustomCanOnlyTakeOneLastSlot() throws Exception {
        UUID user = pro(); boxes(user, 9, 0);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var random = workers.submit(() -> attempt(barrier,
                    () -> open(user, UUID.randomUUID(), uz.efbazaar.trade.trade.domain.TradeKind.SALE)));
            var named = workers.submit(() -> attempt(barrier,
                    () -> custom.claim(user, "race" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), null)));
            assertThat(java.util.List.of(random.get(15, java.util.concurrent.TimeUnit.SECONDS),
                    named.get(15, java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(slots.used(user)).isEqualTo(10);
    }
    private boolean attempt(java.util.concurrent.CyclicBarrier barrier, Runnable action) throws Exception {
        barrier.await(5, java.util.concurrent.TimeUnit.SECONDS);
        try { action.run(); return true; }
        catch (uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException e) { return false; }
        catch (uz.efbazaar.trade.common.exception.ApiCodeException e) {
            assertThat(e.getCode()).isEqualTo("no_slot"); return false;
        }
    }
    @Test void ownershipAndReservationCountOneAndSuccessfulSaleMovesResponsibility() {
        UUID seller = pro(), buyer = pro(); UUID box = box(seller, MailboxKind.RANDOM, 1);
        var trade = pending(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE, box, null);
        assertThat(slots.used(seller)).isEqualTo(1); assertThat(slots.used(buyer)).isEqualTo(1);
        trades.transition(trade.getId(), uz.efbazaar.trade.trade.domain.TradeEvent.BUYER_CONFIRM,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);
        assertThat(slots.used(seller)).isZero(); assertThat(slots.used(buyer)).isEqualTo(1);
        service.detachOwnedBy(buyer, box);
        assertThat(slots.used(buyer)).isEqualTo(1);
    }
    @Test void successfulSwapCommitsCrossedOwnershipWithoutDoubleCharging() {
        UUID seller = pro(), buyer = pro(); boxes(seller, 9, 0); boxes(buyer, 9, 0);
        UUID sellerBox = box(seller, MailboxKind.RANDOM, 1), buyerBox = box(buyer, MailboxKind.RANDOM, 1);
        var trade = pending(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, sellerBox, buyerBox);
        trades.transition(trade.getId(), uz.efbazaar.trade.trade.domain.TradeEvent.BUYER_CONFIRM,
                uz.efbazaar.trade.trade.domain.ActorType.USER, seller);
        trades.transition(trade.getId(), uz.efbazaar.trade.trade.domain.TradeEvent.BUYER_CONFIRM,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);
        assertThat(mailboxes.findById(sellerBox).orElseThrow().getOwnerUserId()).isEqualTo(buyer);
        assertThat(mailboxes.findById(buyerBox).orElseThrow().getOwnerUserId()).isEqualTo(seller);
        assertThat(slots.used(seller)).isEqualTo(10); assertThat(slots.used(buyer)).isEqualTo(10);
    }
    @Test void rejectedSaleReleasesBuyerReservationButRetainsSellerResource() {
        UUID seller = pro(), buyer = pro(); UUID box = box(seller, MailboxKind.RANDOM, 1);
        var trade = pending(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE, box, null);
        trades.transition(trade.getId(), uz.efbazaar.trade.trade.domain.TradeEvent.BUYER_REJECT,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);
        assertThat(slots.used(seller)).isEqualTo(1); assertThat(slots.used(buyer)).isZero();
    }
    @Test void unlinkedAccountAndAdminDetachRetainResponsibilityUntilConfirmedTransfer() {
        UUID user = pro(), recipient = pro(); UUID box = box(user, MailboxKind.RANDOM, 1);
        UUID account = UUID.randomUUID();
        jdbc.update("UPDATE mailboxes SET linked_account_id = ? WHERE id = ?", account, box);
        new org.springframework.transaction.support.TransactionTemplate(tx)
                .executeWithoutResult(status -> mailboxes.clearLinkedAccount(box, account));
        assertThat(slots.used(user)).isEqualTo(1);
        service.detachOwner(UUID.randomUUID(), box);
        assertThat(slots.used(user)).isEqualTo(1);
        service.reassignOwner(UUID.randomUUID(), box, recipient);
        assertThat(slots.used(user)).isZero(); assertThat(slots.used(recipient)).isEqualTo(1);
    }
    @Test void giftResourcesAreVisibleButNeverConsumeQuotaOrServeAsUnlockVictims() {
        UUID user = pro(); boxes(user, 10, 0);
        var gift = service.createPendingForAdmin("gift-" + UUID.randomUUID() + "@efbazaar.uz", user, UUID.randomUUID());
        assertThat(slots.used(user)).isEqualTo(10);
        assertThat(slots.statusFor(user).exemptUsed()).isEqualTo(1);
        assertThat(slots.statusFor(user).resourceUsed()).isEqualTo(11);
        assertThat(access.isLocked(user, gift.getId())).isFalse();
        free(user);
        assertThat(access.excessIds(user)).hasSize(7);
        assertThat(access.lockedIds(user)).isEmpty();
        UUID excess = access.excessIds(user).iterator().next();
        assertThat(access.metadata(user, excess).accessState()).isEqualTo(MailboxAccessService.AccessState.GRACE);
        assertThat(access.metadata(user, gift.getId()).accessState()).isEqualTo(MailboxAccessService.AccessState.ACTIVE);
        assertThat(access.metadata(user, gift.getId()).selectedForFree()).isFalse();
        assertThatThrownBy(() -> service.swapAccess(user, excess, gift.getId()))
                .isInstanceOf(uz.efbazaar.trade.mailbox.exception.InvalidUnlockSwapException.class);
        assertThat(slots.used(user)).isEqualTo(10);
        assertThat(slots.statusFor(user).exemptUsed()).isEqualTo(1);
        assertThat(slots.statusFor(user).resourceUsed()).isEqualTo(11);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void adminMutationRejectsOwnershipChangedSinceItsCachedRead(boolean detach) {
        UUID user = pro(), recipient = pro(), third = pro();
        UUID box = box(user, MailboxKind.RANDOM, 1);
        try (var worker = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            assertThatThrownBy(() -> new org.springframework.transaction.support.TransactionTemplate(tx)
                    .executeWithoutResult(status -> {
                        entityManager.find(Mailbox.class, box); // This transaction now caches the old owner.
                        try {
                            worker.submit(() -> service.reassignOwner(UUID.randomUUID(), box, recipient))
                                    .get(10, java.util.concurrent.TimeUnit.SECONDS);
                        } catch (Exception e) { throw new IllegalStateException(e); }
                        if (detach) service.detachOwner(UUID.randomUUID(), box);
                        else service.reassignOwner(UUID.randomUUID(), box, third);
                    }))
                    .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                            e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        }
        assertThat(mailboxes.findById(box).orElseThrow().getOwnerUserId()).isEqualTo(recipient);
        assertThat(slots.used(user)).isZero(); assertThat(slots.used(recipient)).isEqualTo(1);
        assertThat(slots.used(third)).isZero();
    }
    @Test void adminDetachOfUserCustomPreservesBothResourceAndCustomUsage() {
        UUID user = pro(); UUID box = box(user, MailboxKind.CUSTOM, 1);
        service.detachOwner(UUID.randomUUID(), box);
        assertThat(slots.used(user)).isEqualTo(1);
        assertThat(customSlots.used(user)).isEqualTo(1);
    }
    @Test void currentCustomSublimitDoesNotLockOldCustomWithinTheTotalPool() {
        UUID user = pro(); UUID old = box(user, MailboxKind.CUSTOM, 1);
        free(user);
        assertThat(access.isLocked(user, old)).isFalse();
        assertThat(custom.availability(user, "nonewcustom", null).claimBlock()).isEqualTo("NO_SLOT");
    }

    @Test void statusAliasesAndMailboxPolicyMetadataAreAdditive() throws Exception {
        UUID user = pro(); UUID box = box(user, MailboxKind.RANDOM, 1);
        UUID buyer = pro(); pending(user, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE, box, null);
        var gift = service.createPendingForAdmin("visible-" + UUID.randomUUID() + "@efbazaar.uz", user, UUID.randomUUID());
        var status = slots.statusFor(user);
        assertThat(status.totalUsed()).isEqualTo(status.used()).isEqualTo(1);
        assertThat(status.totalLimit()).isEqualTo(status.limit()).isEqualTo(10);
        assertThat(status.customLimit()).isEqualTo(2);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/mailboxes/" + box)
                .with(uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser(user)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.activeTrade").value(true))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.slotExempt").value(false));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/mailboxes/" + gift.getId())
                .with(uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser(user)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.activeTrade").value(false))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.slotExempt").value(true));
    }

    @Test void failedProvisioningReleasesUnownedReservationsForBothParties() {
        UUID seller = pro(), buyer = pro();
        UUID trade = open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE);
        assertThat(slots.used(seller)).isEqualTo(1); assertThat(slots.used(buyer)).isEqualTo(1);
        trades.transition(trade, uz.efbazaar.trade.trade.domain.TradeEvent.PROVISION_FAILED,
                uz.efbazaar.trade.trade.domain.ActorType.WORKER, null);
        assertThat(slots.used(seller)).isZero(); assertThat(slots.used(buyer)).isZero();
    }
    @Test void oppositeDirectionSwapsRaceForTheLastSlotWithoutDeadlock() throws Exception {
        UUID seller = pro(), buyer = pro(); boxes(seller, 9, 0); boxes(buyer, 9, 0);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> attempt(barrier,
                    () -> open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP)));
            var second = workers.submit(() -> attempt(barrier,
                    () -> open(buyer, seller, uz.efbazaar.trade.trade.domain.TradeKind.SWAP)));
            assertThat(java.util.List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(15, java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(slots.used(seller)).isEqualTo(10); assertThat(slots.used(buyer)).isEqualTo(10);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"-1", "corrupt"})
    void invalidPaidTotalCannotAllocateRandomOrCustom(String value) {
        UUID user = pro();
        projection.replacePlan("PRO", Map.of("mailbox.total_slots", value, "mailbox.custom_slots", "2"),
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        assertThatThrownBy(() -> slots.assertCanAllocate(user))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
        assertThatThrownBy(() -> custom.availability(user, "paidtotal", null))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
    }
    @Test void staffIsUnlimitedOnlyThroughExplicitNullTotalAndCustomGrants() {
        UUID user = UUID.randomUUID(); var grants = new HashMap<String, String>();
        grants.put("mailbox.total_slots", null); grants.put("mailbox.custom_slots", null);
        projection.replacePlan("STAFF", grants, System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        projection.userMoved(user, "STAFF", null, System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        boxes(user, 11, 3);
        assertThat(slots.statusFor(user).totalLimit()).isNull();
        assertThat(slots.statusFor(user).customLimit()).isNull();
        assertThat(slots.statusFor(user).full()).isFalse();
        assertThatCode(() -> slots.assertCanAllocate(user)).doesNotThrowAnyException();
    }

    @Test void lastCustomAllocationHoldsTheQuotaLockUntilItsOuterTransactionCommits() throws Exception {
        UUID user = pro(); boxes(user, 9, 0);
        var claimed = new java.util.concurrent.CountDownLatch(1);
        var commit = new java.util.concurrent.CountDownLatch(1);
        var secondPid = new java.util.concurrent.atomic.AtomicInteger();
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> new org.springframework.transaction.support.TransactionTemplate(tx)
                    .executeWithoutResult(status -> {
                        custom.claim(user, "held" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), null);
                        claimed.countDown();
                        try {
                            if (!commit.await(10, java.util.concurrent.TimeUnit.SECONDS))
                                throw new IllegalStateException("Test did not release allocation transaction");
                        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                    }));
            try {
                assertThat(claimed.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThat(slots.used(user)).as("the first allocation is still uncommitted").isEqualTo(9);
                var second = workers.submit(() -> new org.springframework.transaction.support.TransactionTemplate(tx)
                        .executeWithoutResult(status -> {
                            secondPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                            open(user, UUID.randomUUID(), uz.efbazaar.trade.trade.domain.TradeKind.SALE);
                        }));
                org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(5)).untilAsserted(() ->
                        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE pid = ? "
                                + "AND wait_event_type = 'Lock' AND wait_event = 'advisory'", Integer.class,
                                secondPid.get())).isEqualTo(1));
                assertThat(second.isDone()).isFalse();
                commit.countDown(); first.get(10, java.util.concurrent.TimeUnit.SECONDS);
                assertThatThrownBy(() -> second.get(10, java.util.concurrent.TimeUnit.SECONDS))
                        .isInstanceOf(java.util.concurrent.ExecutionException.class)
                        .hasCauseInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
                assertThat(slots.used(user)).isEqualTo(10);
            } finally { commit.countDown(); }
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(uz.efbazaar.trade.trade.domain.ParticipantRole.class)
    void partialProvisionFailureRetainsTheRealSwapResourceForItsSourceParty(
            uz.efbazaar.trade.trade.domain.ParticipantRole provisionedSide) {
        UUID seller = pro(), buyer = pro();
        UUID responsible = provisionedSide == uz.efbazaar.trade.trade.domain.ParticipantRole.SELLER ? seller : buyer;
        UUID other = responsible.equals(seller) ? buyer : seller;
        boxes(responsible, 9, 0);
        UUID trade = open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP);
        UUID sellerBox = sides.of(trade, uz.efbazaar.trade.trade.domain.ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(trade, uz.efbazaar.trade.trade.domain.ParticipantRole.BUYER).orElseThrow().getMailboxId();
        UUID realBox = provisionedSide == uz.efbazaar.trade.trade.domain.ParticipantRole.SELLER ? sellerBox : buyerBox;
        UUID placeholder = realBox.equals(sellerBox) ? buyerBox : sellerBox;
        provisioned.onEmailProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade, realBox,
                "partial-" + UUID.randomUUID() + "@efbazaar.uz", new byte[]{1}, new byte[12], new byte[16]));
        trades.transition(trade, uz.efbazaar.trade.trade.domain.TradeEvent.PROVISION_FAILED,
                uz.efbazaar.trade.trade.domain.ActorType.WORKER, null);
        Mailbox retained = mailboxes.findById(realBox).orElseThrow();
        assertThat(retained.getOwnerUserId()).as("failed provisioning does not grant new access").isNull();
        assertThat(retained.getRetainedUserId()).isEqualTo(responsible);
        assertThat(retained.getDeletedAt()).isNull();
        assertThat(mailboxes.findById(placeholder).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(slots.used(responsible)).isEqualTo(10);
        assertThat(slots.used(other)).isZero();
        assertThat(jdbc.queryForObject("SELECT metadata->>'realResourcesRetained' FROM trade_audit_log "
                + "WHERE trade_id = ? AND action = 'TRADE_PROVISION_FAILED'", String.class, trade)).isEqualTo("1");
        assertThat(jdbc.queryForObject("SELECT metadata->>'placeholdersDiscarded' FROM trade_audit_log "
                + "WHERE trade_id = ? AND action = 'TRADE_PROVISION_FAILED'", String.class, trade)).isEqualTo("1");
        assertThatThrownBy(() -> open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
        assertThatThrownBy(() -> service.deleteUnheld(realBox))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(uz.efbazaar.trade.trade.domain.ParticipantRole.class)
    void lateKnownProvisioningAfterFailureRestoresRetainedResourceWithoutReopeningTrade(
            uz.efbazaar.trade.trade.domain.ParticipantRole side) {
        UUID seller = pro(), buyer = pro();
        UUID responsible = side == uz.efbazaar.trade.trade.domain.ParticipantRole.SELLER ? seller : buyer;
        UUID other = responsible.equals(seller) ? buyer : seller;
        boxes(responsible, 9, 0);
        UUID trade = open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP);
        UUID box = sides.of(trade, side).orElseThrow().getMailboxId();
        trades.transition(trade, uz.efbazaar.trade.trade.domain.TradeEvent.PROVISION_FAILED,
                uz.efbazaar.trade.trade.domain.ActorType.WORKER, null);
        assertThat(slots.used(responsible)).isEqualTo(9);
        assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(jdbc.queryForObject("SELECT deletion_status FROM mailboxes WHERE id=?", String.class, box))
                .as("discarding an internal placeholder is not a Mailcow deletion acknowledgement").isEqualTo("NONE");
        var event = new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade, box,
                "late-" + UUID.randomUUID() + "@efbazaar.uz", new byte[]{2}, new byte[12], new byte[16]);
        provisioned.onEmailProvisioned(event);
        provisioned.onEmailProvisioned(event); // Replay must not add another charge or reopen anything.
        Mailbox retained = mailboxes.findById(box).orElseThrow();
        assertThat(retained.getDeletedAt()).isNull();
        assertThat(retained.getOwnerUserId()).isNull();
        assertThat(retained.getRetainedUserId()).isEqualTo(responsible);
        assertThat(retained.getEmail()).isEqualTo(event.mailboxEmail());
        assertThat(slots.used(responsible)).isEqualTo(10); assertThat(slots.used(other)).isZero();
        assertThat(tradeRows.findById(trade).orElseThrow().getState())
                .isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.ORPHANED);
        assertThatThrownBy(() -> open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SWAP))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
        UUID recipient = pro(); service.reassignOwner(UUID.randomUUID(), box, recipient);
        service.detachOwner(UUID.randomUUID(), box);
        provisioned.onEmailProvisioned(event);
        assertThat(slots.used(responsible)).isEqualTo(9);
        assertThat(mailboxes.findById(box).orElseThrow().getRetainedUserId()).isEqualTo(recipient);
    }
    @Test void duplicateProvisioningAfterHandoffDoesNotUndoRotatedCredentials() {
        UUID seller = pro(), buyer = pro(); UUID box = box(seller, MailboxKind.RANDOM, 1);
        var trade = pending(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE, box, null);
        trades.transition(trade.getId(), uz.efbazaar.trade.trade.domain.TradeEvent.BUYER_CONFIRM,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);
        byte[] rotated = new byte[]{9, 8, 7};
        service.overwriteAddressAndPassword(box, null, rotated, new byte[12], new byte[16]);
        String address = mailboxes.findById(box).orElseThrow().getEmail();
        provisioned.onEmailProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade.getId(), box,
                address, new byte[]{1, 2, 3}, new byte[12], new byte[16]));
        Mailbox after = mailboxes.findById(box).orElseThrow();
        assertThat(after.getOwnerUserId()).isEqualTo(buyer);
        assertThat(after.getEncryptedPassword()).containsExactly(rotated);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"FOREIGN_RANDOM", "FOREIGN_CUSTOM", "OWN_CUSTOM"})
    void provisioningCannotWriteForeignOrCustomMailboxes(String invalid) {
        UUID seller = pro(), buyer = pro();
        UUID trade = open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE);
        UUID id;
        if (invalid.equals("OWN_CUSTOM")) {
            id = tradeRows.findById(trade).orElseThrow().getMailboxId();
            jdbc.update("UPDATE mailboxes SET kind = 'CUSTOM' WHERE id = ?", id);
        } else id = box(UUID.randomUUID(), invalid.equals("FOREIGN_CUSTOM") ? MailboxKind.CUSTOM : MailboxKind.RANDOM, 1);
        Mailbox before = mailboxes.findById(id).orElseThrow();
        provisioned.onEmailProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade, id,
                "wrong-" + UUID.randomUUID() + "@efbazaar.uz", new byte[]{7}, new byte[12], new byte[16]));
        Mailbox after = mailboxes.findById(id).orElseThrow();
        assertThat(after.getEmail()).isEqualTo(before.getEmail());
        assertThat(after.getEncryptedPassword()).containsExactly(before.getEncryptedPassword());
        assertThat(tradeRows.findById(trade).orElseThrow().getState())
                .isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.INITIATED);
    }
    @Test void legacyProvisioningWithoutMailboxIdStillUsesTheActualTradePlaceholder() {
        UUID seller = pro(), buyer = pro();
        UUID trade = open(seller, buyer, uz.efbazaar.trade.trade.domain.TradeKind.SALE);
        UUID id = tradeRows.findById(trade).orElseThrow().getMailboxId();
        String email = "legacy-" + UUID.randomUUID() + "@efbazaar.uz";
        provisioned.onEmailProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade, null,
                email, new byte[]{7}, new byte[12], new byte[16]));
        assertThat(mailboxes.findById(id).orElseThrow().getEmail()).isEqualTo(email);
        assertThat(tradeRows.findById(trade).orElseThrow().getState())
                .isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.WAITING_EMAIL_CHANGE);
    }
}
