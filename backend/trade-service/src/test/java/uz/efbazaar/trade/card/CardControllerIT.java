package uz.efbazaar.trade.card;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
class CardControllerIT {

    private static Path masterKeyFile;

    @DynamicPropertySource
    static void setupMasterKey(DynamicPropertyRegistry registry) throws IOException {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        masterKeyFile = Files.createTempFile("trade-master-key-", ".txt");
        Files.writeString(masterKeyFile, Base64.getEncoder().encodeToString(key));
        registry.add("trade.crypto.master-key-file", () -> masterKeyFile.toString());
    }

    @Autowired
    private WebApplicationContext ctx;

    private MockMvc mvc;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(ctx).build();
    }

    @Test
    void createReturnsResponseWithoutSensitiveFields() throws Exception {
        UUID userId = UUID.randomUUID();
        String body = """
                {
                  "pan": "4111111111111111",
                  "expiryMonth": 12,
                  "expiryYear": 2027,
                  "brand": "VISA",
                  "cvv": "123",
                  "saveToProfile": true
                }
                """;

        mvc.perform(post("/api/v1/cards")
                        .header("X-User-Id", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.last4", equalTo("1111")))
                .andExpect(jsonPath("$.brand", equalTo("VISA")))
                .andExpect(jsonPath("$.savedToProfile", equalTo(true)))
                .andExpect(jsonPath("$.encryptedPan").doesNotExist())
                .andExpect(jsonPath("$.pan").doesNotExist())
                .andExpect(jsonPath("$.cvv").doesNotExist());
    }

    @Test
    void listReturnsSavedCards() throws Exception {
        UUID userId = UUID.randomUUID();
        String body = """
                {"pan":"4111111111111111","expiryMonth":10,"expiryYear":2026,
                 "brand":"VISA","cvv":"123","saveToProfile":true}
                """;
        mvc.perform(post("/api/v1/cards")
                        .header("X-User-Id", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/cards").header("X-User-Id", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", equalTo(1)));
    }
}
