package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.bot.broadcast.BroadcastExecutor;
import uz.efbazaar.bot.broadcast.BroadcastJob;

/**
 * marketplace-service ommaviy jo'natishni shu yerga topshiradi.
 *
 * <p>Tashqaridan kelmaydi — nginx {@code /bot/internal/} prefiksini bloklaydi.
 *
 * <p>202 qaytadi: jo'natish daqiqalar davom etadi (Telegram sekundiga ~25
 * xabar) va uni HTTP so'rov ichida kutib bo'lmaydi. Borish holati
 * marketplace'ga alohida qaytariladi.
 */
@Slf4j
@RestController
@RequestMapping("/bot/internal/broadcast")
@RequiredArgsConstructor
public class BroadcastController {

    private final BroadcastExecutor executor;

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void accept(@RequestBody BroadcastJob job) {
        log.info("Broadcast {} qabul qilindi", job.broadcastId());
        executor.submit(job);
    }
}
