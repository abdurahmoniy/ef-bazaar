package uz.efbazaar.marketplace.campaign;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignClickRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.PendingCampaignAttributionRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.UserAcquisitionRepository;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kampaniya biriktirish qoidalari.
 *
 * <p>Bu yerdagi xato ekranda ko'rinmaydi, lekin qarorni buzadi: eski
 * foydalanuvchini yangi deb sanash yoki ikkinchi havolaga birinchisining
 * natijasini berish qaysi guruhga vaqt sarflashni noto'g'ri ko'rsatadi.
 */
class CampaignServiceTest {

    private CampaignRepository campaigns;
    private CampaignClickRepository clicks;
    private UserAcquisitionRepository acquisitions;
    private PendingCampaignAttributionRepository pending;
    private AuthSummaryClient users;
    private CampaignService service;

    private final UUID newcomer = UUID.randomUUID();
    private Campaign live;

    @BeforeEach
    void setUp() {
        campaigns = mock(CampaignRepository.class);
        clicks = mock(CampaignClickRepository.class);
        acquisitions = mock(UserAcquisitionRepository.class);
        pending = mock(PendingCampaignAttributionRepository.class);
        users = mock(AuthSummaryClient.class);
        service = new CampaignService(campaigns, clicks, acquisitions, pending, users);

        live = new Campaign("GRP23456", "Guruh posti", Campaign.Kind.TELEGRAM_GROUP, UUID.randomUUID());
        when(campaigns.findByCode("GRP23456")).thenReturn(Optional.of(live));
        when(acquisitions.existsById(newcomer)).thenReturn(false);
        whenAccountAge(Duration.ofMinutes(3));
    }

    private void whenAccountAge(Duration age) {
        when(users.resolve(newcomer)).thenReturn(Optional.of(new UserSummary(
                newcomer, "Yangi", null, null, false, Instant.now().minus(age), false)));
    }

    // --- veb da'vosi -----------------------------------------------------

    @Test
    @DisplayName("a fresh account is attributed to the campaign it arrived from")
    void freshAccountIsAttributed() {
        assertThat(service.claim(newcomer, "grp23456")).isTrue();

        ArgumentCaptor<UserAcquisition> saved = ArgumentCaptor.forClass(UserAcquisition.class);
        verify(acquisitions).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(newcomer);
        assertThat(saved.getValue().getCampaignId()).isEqualTo(live.getId());
    }

    @Test
    @DisplayName("an old account clicking a new post is not counted as that post's newcomer")
    void oldAccountIsNotAttributed() {
        whenAccountAge(CampaignService.CLAIM_WINDOW.plusMinutes(5));

        assertThat(service.claim(newcomer, "GRP23456")).isFalse();
        verify(acquisitions, never()).save(any());
    }

    @Test
    @DisplayName("when auth-service cannot say how old the account is, nothing is attributed")
    void unknownAgeIsNotAttributed() {
        when(users.resolve(newcomer)).thenReturn(Optional.empty());

        assertThat(service.claim(newcomer, "GRP23456")).isFalse();
        verify(acquisitions, never()).save(any());
    }

    @Test
    @DisplayName("the first source wins: a second link never overwrites it")
    void firstSourceWins() {
        when(acquisitions.existsById(newcomer)).thenReturn(true);

        assertThat(service.claim(newcomer, "GRP23456")).isFalse();
        verify(acquisitions, never()).save(any());
    }

    @Test
    @DisplayName("a concurrent claim that loses the race reports false instead of failing")
    void concurrentClaimLoses() {
        when(acquisitions.save(any())).thenThrow(new DataIntegrityViolationException("pk"));

        assertThat(service.claim(newcomer, "GRP23456")).isFalse();
    }

    @Test
    @DisplayName("an archived campaign neither attributes nor counts clicks")
    void archivedCampaignIsSilent() {
        live.setArchivedAt(Instant.now());

        assertThat(service.claim(newcomer, "GRP23456")).isFalse();
        service.recordWebClick("GRP23456", null);

        verify(acquisitions, never()).save(any());
        verify(clicks, never()).save(any());
    }

    @Test
    @DisplayName("malformed codes are rejected before touching the database")
    void malformedCodeIsIgnored() {
        assertThat(service.claim(newcomer, "x' or 1=1")).isFalse();
        service.recordWebClick("toolongcode123", null);

        verify(campaigns, never()).findByCode(anyString());
    }

    // --- bosilish --------------------------------------------------------

    @Test
    @DisplayName("an anonymous web click is still counted")
    void anonymousWebClickCounts() {
        service.recordWebClick("GRP23456", null);

        ArgumentCaptor<CampaignClick> saved = ArgumentCaptor.forClass(CampaignClick.class);
        verify(clicks).save(saved.capture());
        assertThat(saved.getValue().getCampaignId()).isEqualTo(live.getId());
        assertThat(saved.getValue().getChannel()).isEqualTo("WEB");
        assertThat(saved.getValue().getUserId()).isNull();
    }

    // --- bot yo'li -------------------------------------------------------

    @Test
    @DisplayName("a bot /start records the click and keeps the code until registration")
    void botStartIsRemembered() {
        service.rememberBotStart(777L, "GRP23456");

        ArgumentCaptor<CampaignClick> click = ArgumentCaptor.forClass(CampaignClick.class);
        verify(clicks).save(click.capture());
        assertThat(click.getValue().getChannel()).isEqualTo("BOT");
        assertThat(click.getValue().getTelegramId()).isEqualTo(777L);
        verify(pending).save(any(PendingCampaignAttribution.class));
    }

    @Test
    @DisplayName("registration turns the waiting bot code into an attribution and clears it")
    void registrationClaimsPendingCode() {
        when(pending.findById(777L)).thenReturn(Optional.of(new PendingCampaignAttribution(777L, "GRP23456")));

        service.claimOnRegistration(newcomer, 777L);

        verify(acquisitions).save(any(UserAcquisition.class));
        verify(pending).deleteById(777L);
    }

    @Test
    @DisplayName("registration clears a waiting code even when the campaign was archived meanwhile")
    void registrationClearsStaleCode() {
        live.setArchivedAt(Instant.now());
        when(pending.findById(777L)).thenReturn(Optional.of(new PendingCampaignAttribution(777L, "GRP23456")));

        service.claimOnRegistration(newcomer, 777L);

        verify(acquisitions, never()).save(any());
        verify(pending).deleteById(777L);
    }

    // --- adminka ---------------------------------------------------------

    @Test
    @DisplayName("a new campaign gets a readable 8-character code without look-alike characters")
    void createIssuesReadableCode() {
        when(campaigns.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));

        var row = service.create("  Instagram reels  ", Campaign.Kind.SOCIAL, UUID.randomUUID());

        assertThat(row.code()).matches("^[A-HJ-NP-Z2-9]{8}$");
        assertThat(row.name()).isEqualTo("Instagram reels");
        assertThat(row.kind()).isEqualTo("SOCIAL");
        assertThat(row.clicks()).isZero();
    }

    @Test
    @DisplayName("a blank name is rejected")
    void blankNameIsRejected() {
        assertThatThrownBy(() -> service.create("   ", Campaign.Kind.OTHER, UUID.randomUUID()))
                .isInstanceOf(MarketplaceException.class);
    }

    @Test
    @DisplayName("archiving keeps the campaign and stamps it once")
    void archiveStampsOnce() {
        when(campaigns.findById(live.getId())).thenReturn(Optional.of(live));

        service.archive(live.getId());
        Instant first = live.getArchivedAt();
        service.archive(live.getId());

        assertThat(first).isNotNull();
        assertThat(live.getArchivedAt()).isEqualTo(first);
        verify(campaigns, never()).delete(any());
    }
}
