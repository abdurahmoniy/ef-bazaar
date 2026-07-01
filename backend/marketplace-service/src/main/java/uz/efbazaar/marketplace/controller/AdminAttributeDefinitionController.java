package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.AttributeDefinitionCreateRequest;
import uz.efbazaar.marketplace.dto.AttributeDefinitionResponse;
import uz.efbazaar.marketplace.dto.AttributeDefinitionUpdateRequest;
import uz.efbazaar.marketplace.service.AttributeDefinitionService;

import java.util.UUID;

/**
 * Admin CRUD for attribute definitions. Gated by {@code ROLE_ADMIN} in
 * {@link uz.efbazaar.marketplace.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/attributes")
@RequiredArgsConstructor
public class AdminAttributeDefinitionController {

    private final AttributeDefinitionService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AttributeDefinitionResponse create(@Valid @RequestBody AttributeDefinitionCreateRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public AttributeDefinitionResponse update(@PathVariable UUID id,
                                              @Valid @RequestBody AttributeDefinitionUpdateRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.softDelete(id);
    }
}
