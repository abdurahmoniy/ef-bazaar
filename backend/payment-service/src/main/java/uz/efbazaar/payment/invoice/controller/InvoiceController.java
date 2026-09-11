package uz.efbazaar.payment.invoice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.invoice.dto.CreateInvoiceRequest;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.dto.InvoiceStatusResponse;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoices;

    @PostMapping
    public InvoiceResponse create(@AuthenticationPrincipal AuthenticatedUser me,
                                  @Valid @RequestBody CreateInvoiceRequest req) {
        return invoices.create(me.userId(), req.amountUzs());
    }

    /**
     * The wallet page's poll while it waits for a transfer. Carries no card
     * number — see {@link InvoiceStatusResponse} for why that matters here and
     * not on {@code /active}.
     */
    @GetMapping("/{id}/status")
    public InvoiceStatusResponse status(@AuthenticationPrincipal AuthenticatedUser me,
                                        @PathVariable UUID id) {
        return invoices.statusOf(me.userId(), id);
    }

    @GetMapping("/active")
    public ResponseEntity<InvoiceResponse> active(@AuthenticationPrincipal AuthenticatedUser me) {
        return invoices.myActive(me.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
