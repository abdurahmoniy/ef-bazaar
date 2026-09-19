package uz.efbazaar.trade.mailbox;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class MailboxNameIT extends AbstractIntegrationIT {
    @Autowired MockMvc mvc;
    @Autowired MailboxService service;
    @Autowired MailboxRepository repo;
    @Autowired TransactionTemplate tx;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void ownerCanRenameAndClearWhileStrangersCannot() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID id = ownedBox(owner);
        rename(id, owner, "  Main account  ", 204);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isEqualTo("Main account");

        rename(id, UUID.randomUUID(), "Someone else's name", 404);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isEqualTo("Main account");

        rename(id, owner, "   ", 204);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isNull();
    }

    @Test
    void deletedMailboxCannotBeRenamedEvenIfOwnerRemains() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID id = ownedBox(owner);
        Mailbox box = repo.findById(id).orElseThrow();
        box.setDeletedAt(Instant.now());
        repo.saveAndFlush(box);
        rename(id, owner, "Main account", 404);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isNull();
    }

    @Test
    void ownershipChangeClearsNameAndRejectsThePreviousOwner() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        UUID id = ownedBox(owner);
        service.renameOwnedBy(owner, id, "Main account");
        service.assignOwner(id, next);

        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isNull();
        rename(id, owner, "Old owner", 404);
        rename(id, next, "New owner", 204);
    }

    @Test
    void sameOwnerAndCredentialRotationPreserveName() {
        UUID owner = UUID.randomUUID();
        UUID id = ownedBox(owner);
        service.renameOwnedBy(owner, id, "Main account");
        service.assignOwner(id, UUID.fromString(owner.toString()));
        service.overwriteAddressAndPassword(id, null, new byte[]{1}, new byte[12], new byte[16]);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isEqualTo("Main account");
        service.overwriteAddressAndPassword(id, "changed-" + UUID.randomUUID() + "@efbazaar.uz",
                new byte[]{2}, new byte[12], new byte[16]);
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isEqualTo("Main account");
    }

    @Test
    void provisioningDoesNotOverwriteANameSavedAfterItsMailboxRead() throws Exception {
        assertStaleReadPreservesName((id, owner) ->
                service.markProvisioned(id, null, new byte[]{1}, new byte[12], new byte[16]));
    }

    @Test
    void workerAdoptionDoesNotOverwriteANameSavedAfterItsMailboxRead() throws Exception {
        assertStaleReadPreservesName((id, owner) ->
                service.adoptWorkerMailboxId(id, id, "adopted-" + id + "@efbazaar.uz",
                        new byte[]{1}, new byte[12], new byte[16]));
    }

    @Test
    void sameOwnerAssignmentDoesNotOverwriteANameSavedAfterItsMailboxRead() throws Exception {
        assertStaleReadPreservesName(service::assignOwner);
    }

    private void assertStaleReadPreservesName(java.util.function.BiConsumer<UUID, UUID> write)
            throws Exception {
        UUID owner = UUID.randomUUID();
        UUID id = ownedBox(owner);
        service.renameOwnedBy(owner, id, "Old name");
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            tx.executeWithoutResult(status -> {
                // Keep an older managed entity in the caller's transaction while a rename commits.
                repo.findById(id).orElseThrow();
                try {
                    executor.submit(() -> service.renameOwnedBy(owner, id, "New name"))
                            .get(10, TimeUnit.SECONDS);
                } catch (Exception ex) {
                    throw new AssertionError(ex);
                }
                write.accept(id, owner);
            });
        }
        assertThat(repo.findById(id).orElseThrow().getDisplayName()).isEqualTo("New name");
    }

    @Test
    void renameWaitingOnAnOwnershipTransferCannotLabelTheNewOwnersMailbox() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        UUID id = ownedBox(owner);
        service.renameOwnedBy(owner, id, "Old name");
        CountDownLatch assigned = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CountDownLatch renaming = new CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var handover = executor.submit(() -> tx.executeWithoutResult(status -> {
                Mailbox box = repo.findById(id).orElseThrow();
                box.setOwnerUserId(next);
                repo.saveAndFlush(box);
                assigned.countDown();
                try {
                    if (!commit.await(10, TimeUnit.SECONDS)) throw new AssertionError("handover timed out");
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(ex);
                }
            }));
            try {
                assertThat(assigned.await(10, TimeUnit.SECONDS)).isTrue();
                var rename = executor.submit(() -> {
                    renaming.countDown();
                    assertThatThrownBy(() -> service.renameOwnedBy(owner, id, "Stale owner's name"))
                            .isInstanceOf(EntityNotFoundException.class);
                });
                assertThat(renaming.await(10, TimeUnit.SECONDS)).isTrue();
                org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).until(() ->
                        jdbc.queryForObject("""
                                SELECT count(*) FROM pg_stat_activity
                                 WHERE wait_event_type = 'Lock'
                                   AND query LIKE 'update mailboxes%'
                                   AND query LIKE '%display_name%'
                                """, Integer.class) > 0);
                commit.countDown();
                handover.get(10, TimeUnit.SECONDS);
                rename.get(10, TimeUnit.SECONDS);
            } finally {
                commit.countDown();
            }
        }
        Mailbox after = repo.findById(id).orElseThrow();
        assertThat(after.getOwnerUserId()).isEqualTo(next);
        assertThat(after.getDisplayName()).isNull();
    }

    private UUID ownedBox(UUID owner) {
        UUID id = service.createPlaceholder("name-" + UUID.randomUUID() + "@efbazaar.uz");
        service.assignOwner(id, owner);
        return id;
    }

    private void rename(UUID id, UUID owner, String name, int expectedStatus) throws Exception {
        mvc.perform(patch("/api/v1/mailboxes/{id}/name", id).with(asUser(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"" + name + "\"}"))
                .andExpect(status().is(expectedStatus));
    }
}
