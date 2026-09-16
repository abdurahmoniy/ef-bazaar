package uz.efbazaar.marketplace.push;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter @Setter
@ConfigurationProperties(prefix = "notifications.push")
public class PushProperties {
    private boolean enabled;
    private String projectId;
}
