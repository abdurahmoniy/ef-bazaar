package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * trade-service savdo ochayotganda so'raydi.
 *
 * <p>Javob bo'sh bo'lishi MUTLAQO NORMAL: xaridor e'lonni efBazaar'ning
 * o'zidan topgan bo'lishi mumkin. Chaqiruvchi buni xato deb qaramasligi
 * kerak, va bu chaqiruv yiqilsa savdo baribir ochilishi kerak.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/partners")
@RequiredArgsConstructor
public class InternalAttributionController {

    private final ListingAttributionService service;

    @GetMapping("/attribution")
    public AttributionResponse attribution(@RequestParam UUID listingId,
                                           @RequestParam UUID buyerId) {
        return service.attributionFor(listingId, buyerId)
                .map(a -> new AttributionResponse(a.partnerChannelId(), a.partnerUserId(), a.percentBp()))
                .orElseGet(() -> new AttributionResponse(null, null, 0));
    }

    public record AttributionResponse(UUID partnerChannelId, UUID partnerUserId, int percentBp) {}
}
