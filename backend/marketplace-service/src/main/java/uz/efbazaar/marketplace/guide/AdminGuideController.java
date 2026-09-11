package uz.efbazaar.marketplace.guide;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.guide.GuideDtos.ButtonResponse;
import uz.efbazaar.marketplace.guide.GuideDtos.GuideResponse;
import uz.efbazaar.marketplace.guide.GuideDtos.SaveButtonsRequest;
import uz.efbazaar.marketplace.guide.GuideDtos.UpdateCategoryRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Adminka "Qo'llanmalar" bo'limi va bot tugmalari — /api/v1/admin/** ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/guides")
@RequiredArgsConstructor
public class AdminGuideController {

    private final GuideService service;

    @GetMapping
    public List<GuideResponse> list() {
        return service.list();
    }

    @PostMapping(consumes = "multipart/form-data")
    public GuideResponse create(@RequestParam("title") String title,
                                @RequestParam("description") String description,
                                @RequestParam(value = "category", required = false, defaultValue = "start") String category,
                                @RequestParam("video") MultipartFile video,
                                @AuthenticationPrincipal AuthenticatedUser admin) {
        return service.create(title, description, category, video, admin.userId());
    }

    @PatchMapping("/{id}/category")
    public GuideResponse updateCategory(@PathVariable UUID id,
                                        @Valid @RequestBody UpdateCategoryRequest request) {
        return service.updateCategory(id, request.category());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    @GetMapping("/buttons")
    public List<ButtonResponse> buttons() {
        return service.listButtons();
    }

    @PutMapping("/buttons")
    public List<ButtonResponse> saveButtons(@Valid @RequestBody SaveButtonsRequest request) {
        return service.saveButtons(request.buttons() == null ? List.of() : request.buttons());
    }
}
