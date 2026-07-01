package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.AttributeDefinitionResponse;
import uz.efbazaar.marketplace.service.AttributeDefinitionService;

import java.util.List;
import java.util.UUID;

/**
 * Public read-only access to attribute definitions. Consumed by the frontend to
 * render the listing form dynamically and to enumerate filterable attributes.
 * Admin CRUD lives on the parallel {@code /api/v1/admin/attributes} routes.
 */
@RestController
@RequestMapping("/api/v1/attributes")
@RequiredArgsConstructor
public class AttributeDefinitionController {

    private final AttributeDefinitionService service;

    @GetMapping
    public List<AttributeDefinitionResponse> list(
            @RequestParam(defaultValue = "false") boolean includeInactive,
            @RequestParam(required = false) String group) {
        return service.list(includeInactive, group);
    }

    @GetMapping("/{id}")
    public AttributeDefinitionResponse get(@PathVariable UUID id) {
        return service.getById(id);
    }
}
