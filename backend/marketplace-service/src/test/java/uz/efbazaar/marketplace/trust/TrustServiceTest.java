package uz.efbazaar.marketplace.trust;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;
import uz.efbazaar.marketplace.service.NotificationService;
import uz.efbazaar.marketplace.trust.TrustDtos.FileComplaintRequest;
import uz.efbazaar.marketplace.trust.TrustRepositories.BlacklistIdentifierRepository;
import uz.efbazaar.marketplace.trust.TrustRepositories.ComplaintRepository;
import uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrustServiceTest {

    private static final UUID ADMIN = UUID.randomUUID();
    private static final UUID ACCUSED = UUID.randomUUID();
    private static final UUID COMPLAINANT = UUID.randomUUID();

    @Mock private ComplaintRepository complaints;
    @Mock private PenaltyRepository penalties;
    @Mock private BlacklistIdentifierRepository identifiers;
    @Mock private ListingRepository listings;
    @Mock private NotificationService notifications;
    @Mock private MarketplaceEventPublisher events;
    @Mock private AuthNameClient authNames;

    private TrustService service;

    @BeforeEach
    void setUp() {
        service = new TrustService(complaints, penalties, identifiers, listings,
                notifications, events, authNames);
        lenient().when(penalties.save(any())).thenAnswer(inv -> {
            Penalty p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });
        lenient().when(penalties.findByUserIdAndStatus(any(), any())).thenReturn(List.of());
    }

    private Complaint pending() {
        return Complaint.builder()
                .id(UUID.randomUUID())
                .complainantId(COMPLAINANT)
                .accusedId(ACCUSED)
                .contextType(Complaint.ContextType.MATCH)
                .contextId("42")
                .category(Complaint.Category.LAG_BREAK)
                .status(Complaint.Status.PENDING)
                .build();
    }

    private List<Complaint> confirmedComplaints(int n) {
        return IntStream.range(0, n).mapToObj(i -> Complaint.builder()
                .id(UUID.randomUUID()).complainantId(UUID.randomUUID()).accusedId(ACCUSED)
                .status(Complaint.Status.CONFIRMED).build()).toList();
    }

    @Test
    void selfComplaintRejected() {
        FileComplaintRequest req = new FileComplaintRequest(COMPLAINANT,
                Complaint.ContextType.CHAT, "c1", Complaint.Category.TOXIC, null, null);

        assertThrows(MarketplaceException.class,
                () -> service.fileComplaint(COMPLAINANT, req));
    }

    @Test
    void firstConfirmedComplaintIssuesWarningOnly() {
        Complaint c = pending();
        when(complaints.findById(c.getId())).thenReturn(Optional.of(c));
        when(complaints.findByAccusedIdAndStatus(ACCUSED, Complaint.Status.CONFIRMED))
                .thenReturn(confirmedComplaints(1));

        service.confirm(c.getId(), ADMIN);

        verify(notifications).trustNotice(ACCUSED, NotificationType.TRUST_WARNING);
        verify(penalties, never()).save(any());
        verify(events, never()).userBlacklisted(any(), any(), any(), any(), any());
    }

    @Test
    void thirdConfirmedComplaintIssuesSevenDayTempBlock() {
        Complaint c = pending();
        when(complaints.findById(c.getId())).thenReturn(Optional.of(c));
        when(complaints.findByAccusedIdAndStatus(ACCUSED, Complaint.Status.CONFIRMED))
                .thenReturn(confirmedComplaints(3));

        service.confirm(c.getId(), ADMIN);

        ArgumentCaptor<Penalty> saved = ArgumentCaptor.forClass(Penalty.class);
        verify(penalties).save(saved.capture());
        assertEquals(Penalty.Type.TEMP_BLOCK, saved.getValue().getType());
        assertNotNull(saved.getValue().getExpiresAt());
        verify(listings).retagBySellerAndStatus(ACCUSED, ListingStatus.ACTIVE, ListingStatus.BLOCKED);
        verify(events).userBlacklisted(any(), eq(ACCUSED), eq("TEMP_BLOCK"), any(), any());
        verify(notifications).trustNotice(ACCUSED, NotificationType.TRUST_BLOCKED);
    }

    @Test
    void fifthConfirmedComplaintIssuesPermanentBlock() {
        Complaint c = pending();
        when(complaints.findById(c.getId())).thenReturn(Optional.of(c));
        when(complaints.findByAccusedIdAndStatus(ACCUSED, Complaint.Status.CONFIRMED))
                .thenReturn(confirmedComplaints(5));

        service.confirm(c.getId(), ADMIN);

        ArgumentCaptor<Penalty> saved = ArgumentCaptor.forClass(Penalty.class);
        verify(penalties).save(saved.capture());
        assertEquals(Penalty.Type.PERM_BLOCK, saved.getValue().getType());
        assertNull(saved.getValue().getExpiresAt());
    }

    @Test
    void thirdRejectedComplaintWarnsTheFalseReporter() {
        Complaint c = pending();
        when(complaints.findById(c.getId())).thenReturn(Optional.of(c));
        when(complaints.countByComplainantIdAndStatus(COMPLAINANT, Complaint.Status.REJECTED))
                .thenReturn(3L);

        service.reject(c.getId(), ADMIN);

        verify(notifications).trustNotice(COMPLAINANT, NotificationType.TRUST_WARNING);
        assertEquals(Complaint.Status.REJECTED, c.getStatus());
    }

    @Test
    void revokeRestoresListingsAndPublishesUnblacklist() {
        Penalty p = Penalty.builder().id(UUID.randomUUID()).userId(ACCUSED)
                .type(Penalty.Type.TEMP_BLOCK).reason("r").status(Penalty.Status.ACTIVE).build();
        when(penalties.findById(p.getId())).thenReturn(Optional.of(p));

        service.revokePenalty(p.getId(), ADMIN);

        assertEquals(Penalty.Status.REVOKED, p.getStatus());
        verify(listings).retagBySellerAndStatus(ACCUSED, ListingStatus.BLOCKED, ListingStatus.ACTIVE);
        verify(events).userUnblacklisted(p.getId(), ACCUSED, "revoked");
        verify(notifications).trustNotice(ACCUSED, NotificationType.TRUST_UNBLOCKED);
    }

    @Test
    void identifierNormalization() {
        assertEquals("scammer", BlacklistIdentifier.normalize(
                BlacklistIdentifier.Type.TELEGRAM_USERNAME, "@Scammer"));
        assertEquals("998901234567", BlacklistIdentifier.normalize(
                BlacklistIdentifier.Type.PHONE, "+998 90 123-45-67"));
    }
}
