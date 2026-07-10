package uz.efbazaar.trade.card.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.dto.CardResponse;
import uz.efbazaar.trade.card.mapper.CardMapper;
import uz.efbazaar.trade.card.service.CardService;

import java.util.List;
import java.util.UUID;

/**
 * Plan A auth model: caller identity comes from X-User-Id header, set by nginx
 * after the auth-service auth_request check. Plan B replaces this with a real
 * JWT resolver and Spring Security config.
 */
@RestController
@RequestMapping("/api/v1/cards")
@RequiredArgsConstructor
public class CardController {

    private final CardService cardService;
    private final CardMapper mapper;

    @PostMapping
    public ResponseEntity<CardResponse> create(
            @RequestHeader("X-User-Id") UUID userId,
            @Valid @RequestBody CardCreateRequest request) {
        var card = cardService.create(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toResponse(card));
    }

    @GetMapping
    public List<CardResponse> listSaved(@RequestHeader("X-User-Id") UUID userId) {
        return cardService.listSaved(userId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @DeleteMapping("/{cardId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID cardId) {
        cardService.delete(userId, cardId);
    }
}
