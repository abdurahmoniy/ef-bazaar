package uz.efbazaar.trade.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(StubEscrowConfig.class)
class MailboxGraceIT extends AbstractIntegrationIT {
    @Autowired MailboxRepository boxes;
    @Autowired PlanProjection projection;
    @Autowired MailboxAccessService access;

    @Test void paidExpiryKeepsExcessMailReadableForThirtyDays() {
        UUID user = UUID.randomUUID();
        for (int i = 0; i < 10; i++) {
            UUID id = UUID.randomUUID();
            boxes.saveAndFlush(Mailbox.builder().id(id).email("grace-" + id + "@efbazaar.uz")
                .ownerUserId(user).encryptedPassword(new byte[]{1}).passwordIv(new byte[12])
                .passwordTag(new byte[16]).accessPriority(i).build());
        }
        projection.userMoved(user, "PRO", Instant.now().minusSeconds(86400), System.nanoTime(),
                "grace-" + UUID.randomUUID(), Instant.now());
        assertThat(access.lockedIds(user)).as("expiry starts a grace window for the same existing mailboxes").isEmpty();
    }
    @Autowired uz.efbazaar.trade.plan.repository.UserPlanViewRepository plans;
    @Autowired uz.efbazaar.trade.plan.service.MailboxSlotService slots;

    @Test void standardSnapshotsNeverEraseTheActualPaidExpiry() {
        UUID user=UUID.randomUUID(); Instant expiry=Instant.now().minusSeconds(86400).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        projection.userMoved(user,"PRO",expiry,1,"history-"+UUID.randomUUID(),Instant.now());
        projection.userMoved(user,"STANDARD",null,2,"history-"+UUID.randomUUID(),Instant.now());
        assertThat(plans.findById(user).orElseThrow().getLastPaidExpiresAt()).isEqualTo(expiry.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        Instant renewed=Instant.now().plusSeconds(86400).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        projection.userMoved(user,"PRO",renewed,null,3,"history-"+UUID.randomUUID(),Instant.now());
        assertThat(plans.findById(user).orElseThrow().getLastPaidExpiresAt()).isEqualTo(renewed.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    }

    @Test void renewalRestoresTheSameBoxesAndDoesNotAllocateAnotherTen() {
        UUID user=UUID.randomUUID();java.util.Set<UUID> ids=new java.util.HashSet<>();
        for(int i=0;i<10;i++) {
          UUID id=UUID.randomUUID();ids.add(id);boxes.saveAndFlush(Mailbox.builder().id(id).email("renew-"+id+"@efbazaar.uz")
           .ownerUserId(user).encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
        }
        projection.userMoved(user,"PRO",Instant.now().minusSeconds(31L*86400),1,"renew-"+UUID.randomUUID(),Instant.now());
        assertThat(access.lockedIds(user)).hasSize(7);
        projection.replacePlan("PRO",java.util.Map.of("mailbox.total_slots","10"),System.nanoTime(),"renew-"+UUID.randomUUID(),Instant.now());
        projection.userMoved(user,"PRO",Instant.now().plusSeconds(86400),2,"renew-"+UUID.randomUUID(),Instant.now());
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(boxes.findByOwnerUserId(user)).extracting(Mailbox::getId).containsExactlyInAnyOrderElementsOf(ids);
        assertThat(slots.used(user)).isEqualTo(10);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->slots.assertCanAllocate(user))
          .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }

    @Test void staffExpiryNeverCreatesPaidHistoryOrMovesAnExistingPaidBoundary() {
        UUID user=UUID.randomUUID();
        projection.userMoved(user,"STAFF",Instant.now().plusSeconds(86400),1,"staff-"+UUID.randomUUID(),Instant.now());
        assertThat(plans.findById(user).orElseThrow().getLastPaidExpiresAt()).isNull();
        Instant paid=Instant.now().minusSeconds(86400).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        projection.userMoved(user,"PRO",paid,2,"staff-"+UUID.randomUUID(),Instant.now());
        projection.userMoved(user,"STAFF",Instant.now().plusSeconds(86400),3,"staff-"+UUID.randomUUID(),Instant.now());
        assertThat(plans.findById(user).orElseThrow().getLastPaidExpiresAt()).isEqualTo(paid);
    }

}
