package uz.efbazaar.marketplace.guide;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.guide.GuideDtos.GuideResponse;
import uz.efbazaar.marketplace.guide.GuideRepositories.GuideButtonRepository;
import uz.efbazaar.marketplace.guide.GuideRepositories.GuideRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GuideServiceTest {

    private final GuideRepository guides = mock(GuideRepository.class);
    private final GuideButtonRepository buttons = mock(GuideButtonRepository.class);
    private final GuideVideoUploader uploader = mock(GuideVideoUploader.class);
    private final GuideService service = new GuideService(guides, buttons, uploader);

    private static final UUID ADMIN_ID = UUID.randomUUID();

    @Test
    @DisplayName("yangi qo'llanma toifasi bilan saqlanadi")
    void createsGuideWithCategory() {
        MockMultipartFile file = new MockMultipartFile("video", "test.mp4", "video/mp4", new byte[]{1, 2, 3});
        when(uploader.upload(any(), any())).thenReturn(new GuideVideoUploader.UploadResponse("file-123", 10, "VIDEO"));
        when(guides.count()).thenReturn(2L);
        when(guides.save(any(Guide.class))).thenAnswer(i -> i.getArgument(0));

        GuideResponse response = service.create("Xavfsiz bitim", "Garov qanday ishlaydi", "safety", file, ADMIN_ID);

        assertThat(response.title()).isEqualTo("Xavfsiz bitim");
        assertThat(response.category()).isEqualTo("safety");
        assertThat(response.videoFileId()).isEqualTo("file-123");

        ArgumentCaptor<Guide> captor = ArgumentCaptor.forClass(Guide.class);
        verify(guides).save(captor.capture());
        assertThat(captor.getValue().getCategory()).isEqualTo("safety");
        assertThat(captor.getValue().getSortOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("toifa ko'rsatilmaganda 'start' standarti beriladi")
    void defaultsCategoryToStartWhenBlank() {
        MockMultipartFile file = new MockMultipartFile("video", "test.mp4", "video/mp4", new byte[]{1, 2, 3});
        when(uploader.upload(any(), any())).thenReturn(new GuideVideoUploader.UploadResponse("file-456", 11, "VIDEO"));
        when(guides.count()).thenReturn(0L);
        when(guides.save(any(Guide.class))).thenAnswer(i -> i.getArgument(0));

        GuideResponse response = service.create("Boshlash", "Tizimga kirish", "", file, ADMIN_ID);

        assertThat(response.category()).isEqualTo("start");
    }

    @Test
    @DisplayName("toifa bo'yicha saralash")
    void listsByCategory() {
        Guide g1 = Guide.builder()
                .id(UUID.randomUUID())
                .title("Akkount sotish")
                .description("Qanday sotiladi")
                .videoFileId("file-seller")
                .mediaKind("VIDEO")
                .category("seller")
                .createdAt(Instant.now())
                .sortOrder(0)
                .build();

        when(guides.findAllByCategoryOrderBySortOrderAscCreatedAtAsc("seller")).thenReturn(List.of(g1));

        List<GuideResponse> result = service.listByCategory("seller");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).title()).isEqualTo("Akkount sotish");
        assertThat(result.get(0).category()).isEqualTo("seller");
    }

    @Test
    @DisplayName("toifa yangilash")
    void updatesCategory() {
        UUID id = UUID.randomUUID();
        Guide g = Guide.builder()
                .id(id)
                .title("Hamyon to'ldirish")
                .description("Uzcard/Humo")
                .videoFileId("file-w")
                .mediaKind("VIDEO")
                .category("start")
                .createdAt(Instant.now())
                .sortOrder(0)
                .build();

        when(guides.findById(id)).thenReturn(Optional.of(g));
        when(guides.save(any(Guide.class))).thenAnswer(i -> i.getArgument(0));

        GuideResponse updated = service.updateCategory(id, "wallet");
        assertThat(updated.category()).isEqualTo("wallet");
        assertThat(g.getCategory()).isEqualTo("wallet");
    }

    @Test
    @DisplayName("mavjud bo'lmagan qo'llanma toifasini yangilash 404 beradi")
    void updateCategoryThrowsNotFound() {
        UUID id = UUID.randomUUID();
        when(guides.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateCategory(id, "wallet"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
