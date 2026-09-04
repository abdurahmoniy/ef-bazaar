package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Kunlik yangilanishning navbatga qo'yilishi.
 *
 * <p>Ish jimgina hech narsa qilmasligi eng xavfli holat: raqamlar
 * eskirib boraveradi va buni hech kim sezmaydi, chunki xato ham
 * chiqmaydi.
 */
class ChannelRefreshJobTest {

    private final PartnerChannelRepository channels = mock(PartnerChannelRepository.class);
    private final PartnerAdEventPublisher events = mock(PartnerAdEventPublisher.class);
    private final ChannelRefreshJob job = new ChannelRefreshJob(channels, events);

    @Test
    @DisplayName("har bir faol kanal uchun alohida topshiriq yuboriladi")
    void oneTaskPerChannel() {
        // Kanal-kanal qilib: bitta kanalning Telegram xatosi
        // qolganlarini to'sib qo'ymasin.
        PartnerChannel first = channel();
        PartnerChannel second = channel();
        when(channels.findByActiveTrueOrderBySubscriberCountDesc())
                .thenReturn(List.of(first, second));

        job.run();

        verify(events).refreshRequested(first);
        verify(events).refreshRequested(second);
    }

    @Test
    @DisplayName("faol kanal bo'lmasa hech narsa yuborilmaydi")
    void nothingToRefresh() {
        when(channels.findByActiveTrueOrderBySubscriberCountDesc()).thenReturn(List.of());

        job.run();

        verifyNoInteractions(events);
    }

    private PartnerChannel channel() {
        PartnerChannel channel = new PartnerChannel();
        channel.setId(UUID.randomUUID());
        channel.setTelegramChannelId(-100L - System.nanoTime() % 1000);
        return channel;
    }
}
