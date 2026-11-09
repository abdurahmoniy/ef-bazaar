package uz.efbazaar.marketplace.campaign;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.campaign.CampaignDtos.CampaignRow;
import uz.efbazaar.marketplace.campaign.CampaignDtos.CreateCampaignRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Adminka "Kampaniyalar" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/campaigns")
@RequiredArgsConstructor
public class AdminCampaignController {

    private final CampaignService service;

    /** Har kampaniya: bosish → ro'yxatdan o'tish → e'lon joylash → sotish. */
    @GetMapping
    public List<CampaignRow> funnel() {
        return service.funnel();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CampaignRow create(@AuthenticationPrincipal AuthenticatedUser admin,
                              @Valid @RequestBody CreateCampaignRequest request) {
        return service.create(request.name(), request.kind(), admin.userId());
    }

    @PostMapping("/{id}/archive")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@PathVariable UUID id) {
        service.archive(id);
    }
}
