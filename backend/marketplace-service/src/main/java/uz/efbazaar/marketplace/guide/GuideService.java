package uz.efbazaar.marketplace.guide;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.guide.GuideDtos.BotGuideButton;
import uz.efbazaar.marketplace.guide.GuideDtos.ButtonRequest;
import uz.efbazaar.marketplace.guide.GuideDtos.ButtonResponse;
import uz.efbazaar.marketplace.guide.GuideDtos.GuideResponse;
import uz.efbazaar.marketplace.guide.GuideRepositories.GuideButtonRepository;
import uz.efbazaar.marketplace.guide.GuideRepositories.GuideRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Video qo'llanmalar va ular uchun bot tugmalari.
 *
 * <p>Servis DTO qaytaradi, entity emas — `GuideButton.guide` lazy va uni
 * kontrollerda ochish `LazyInitializationException` berardi. Emoji
 * to'plamlarida aynan shu xato bo'lgan edi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GuideService {

    private final GuideRepository guides;
    private final GuideButtonRepository buttons;
    private final GuideVideoUploader uploader;

    @Transactional(readOnly = true)
    public List<GuideResponse> list() {
        return guides.findAllByOrderBySortOrderAscCreatedAtAsc().stream()
                .map(GuideResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<GuideResponse> listByCategory(String category) {
        if (category == null || category.isBlank() || "all".equalsIgnoreCase(category.strip())) {
            return list();
        }
        return guides.findAllByCategoryOrderBySortOrderAscCreatedAtAsc(category.strip()).stream()
                .map(GuideResponse::from).toList();
    }

    /**
     * Video Telegram'ga yuklanadi, bizda faqat `file_id` qoladi.
     *
     * <p>Yuklash MUVAFFAQIYATLI bo'lgandagina qator yoziladi: aks holda
     * bazada videosiz qo'llanma qolardi va u bosilganda bot hech narsa
     * yubora olmasdi.
     */
    @Transactional
    public GuideResponse create(String title, String description, String category,
                                MultipartFile video, UUID adminId) {
        GuideVideoUploader.UploadResponse uploaded = uploader.upload(video, description);

        String cat = category == null || category.isBlank() ? "start" : category.strip();
        Guide guide = Guide.builder()
                .id(UUID.randomUUID())
                .title(title.strip())
                .description(description.strip())
                .videoFileId(uploaded.fileId())
                .mediaKind(uploaded.kindOrVideo())
                .category(cat)
                .createdBy(adminId)
                .createdAt(Instant.now())
                .sortOrder((int) guides.count())
                .build();
        log.info("Qo'llanma qo'shildi: {} (category={}, admin={})", guide.getTitle(), cat, adminId);
        return GuideResponse.from(guides.save(guide));
    }

    @Transactional
    public GuideResponse updateCategory(UUID id, String category) {
        Guide guide = guides.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Qo'llanma topilmadi"));
        String cat = category == null || category.isBlank() ? "start" : category.strip();
        guide.setCategory(cat);
        log.info("Qo'llanma toifasi yangilandi: {} -> {}", guide.getTitle(), cat);
        return GuideResponse.from(guides.save(guide));
    }

    @Transactional
    public void delete(UUID id) {
        if (!guides.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Qo'llanma topilmadi");
        }
        // Tugmalar ON DELETE CASCADE bilan ketadi: qolsa, bosilganda hech
        // narsa kelmasdi va foydalanuvchi sababni bilmasdi.
        guides.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<ButtonResponse> listButtons() {
        return buttons.findAllByOrderBySortOrderAsc().stream()
                .map(ButtonResponse::from).toList();
    }

    /** Bot uchun — yozuv, tavsif va video birga. */
    @Transactional(readOnly = true)
    public List<BotGuideButton> botButtons() {
        return buttons.findAllByOrderBySortOrderAsc().stream()
                .map(BotGuideButton::from).toList();
    }

    /**
     * Tugmalar ro'yxatini BUTUNLAY almashtiradi.
     *
     * <p>Tartib ma'noga ega va u ro'yxatdagi joydan olinadi — frontendda
     * ko'rgan tartib botda ham shunday chiqadi.
     */
    @Transactional
    public List<ButtonResponse> saveButtons(List<ButtonRequest> requested) {
        buttons.deleteAll();
        // flush shart: yangi qatorlar eskilar o'chishidan oldin yozilsa,
        // tartib indeksida to'qnashuv bo'lardi.
        buttons.flush();

        List<GuideButton> saved = new ArrayList<>();
        int order = 0;
        for (ButtonRequest request : requested) {
            Guide guide = guides.findById(request.guideId()).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Tanlangan qo'llanma topilmadi: " + request.guideId()));
            saved.add(GuideButton.builder()
                    .id(UUID.randomUUID())
                    .label(request.label().strip())
                    .guide(guide)
                    .sortOrder(order++)
                    .build());
        }
        return buttons.saveAll(saved).stream().map(ButtonResponse::from).toList();
    }
}
