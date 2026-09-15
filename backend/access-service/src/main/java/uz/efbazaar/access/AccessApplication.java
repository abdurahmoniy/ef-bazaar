package uz.efbazaar.access;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan("uz.efbazaar.access")
public class AccessApplication {
    public static void main(String[] args) {
        SpringApplication.run(AccessApplication.class, args);
    }
}
