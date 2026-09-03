package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelCard;

import java.util.List;

/** E'lon berish oynasidagi kanal tanlash paneli. */
@RestController
@RequestMapping("/api/v1/partners/channels")
@RequiredArgsConstructor
public class ChannelDirectoryController {

    private final ChannelDirectoryService service;

    @GetMapping
    public List<ChannelCard> search(@RequestParam(name = "q", required = false) String query) {
        return service.search(query);
    }
}
