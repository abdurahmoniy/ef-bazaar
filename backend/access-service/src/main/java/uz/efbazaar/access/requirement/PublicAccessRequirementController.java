package uz.efbazaar.access.requirement;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Shartlar ekrani uchun ro'yxat. Login'siz ochiq: foydalanuvchi aynan shu
 * shartlarni bajarmagani uchun kira olmagan. Ichida maxfiy narsa yo'q —
 * ommaviy kanal nomlari va havolalari.
 */
@RestController
@RequiredArgsConstructor
public class PublicAccessRequirementController {

    private final AccessRequirementService service;

    @GetMapping("/api/v1/access-requirements")
    public List<RequirementView> list() {
        return service.list();
    }
}
