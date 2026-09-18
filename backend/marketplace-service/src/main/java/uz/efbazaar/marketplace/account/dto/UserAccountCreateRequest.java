package uz.efbazaar.marketplace.account.dto;

import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * Akkount yarim to'ldirilgan bo'lishi mumkin — majburiy atributlar bu yerda
 * talab qilinmaydi. To'liqlik faqat bozorga chiqarishda, e'lon
 * validatsiyasi orqali tekshiriladi.
 */
public record UserAccountCreateRequest(
        @Size(max = 120) String title,
        @Size(max = 4000) String description,
        Map<String, Object> attributes,
        List<String> mediaMessageIds) {}
