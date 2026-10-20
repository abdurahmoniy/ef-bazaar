package uz.efbazaar.payment.testsupport;

import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Base class for JPA / Flyway tests. Boots a single shared PostgreSQL 16 container
 * for the whole test JVM (static field → shared across subclasses) and mounts it
 * as the payment-service datasource. Real Flyway migrations run — no H2 shim.
 *
 * <p>Also writes a random 32-byte master key into {@code target/test-master-key}
 * so {@code MasterKeyProvider} finds one without asking the operator to plug in
 * a real docker secret when running {@code mvn verify}.
 */
// Close scheduled work and JDBC pools before Testcontainers retires the shared database.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ActiveProfiles("test")
@Testcontainers
public abstract class AbstractPostgresIT {

    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("payment_db_test")
                    .withUsername("test")
                    .withPassword("test")
                    .withReuse(true);

    protected static final Path MASTER_KEY_PATH = Path.of("target/test-master-key");

    static {
        POSTGRES.start();
        writeMasterKey();
    }

    private static void writeMasterKey() {
        try {
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            Files.createDirectories(MASTER_KEY_PATH.getParent());
            Files.writeString(MASTER_KEY_PATH, Base64.getEncoder().encodeToString(key));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to write test master key", e);
        }
    }

    @DynamicPropertySource
    static void registerPostgres(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("payment.crypto.master-key-file", MASTER_KEY_PATH::toString);
    }
}
