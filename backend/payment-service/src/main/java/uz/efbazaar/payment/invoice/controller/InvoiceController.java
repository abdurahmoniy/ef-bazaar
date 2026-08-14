package uz.efbazaar.payment.invoice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.invoice.dto.CreateInvoiceRequest;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.security.AuthenticatedUser;

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

    @GetMapping("/active")
    public ResponseEntity<InvoiceResponse> active(@AuthenticationPrincipal AuthenticatedUser me) {
        return invoices.myActive(me.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
