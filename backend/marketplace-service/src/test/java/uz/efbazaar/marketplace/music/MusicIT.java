package uz.efbazaar.marketplace.music;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.exception.GlobalExceptionHandler;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitConfig(MusicIT.Config.class)
@WebAppConfiguration
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class MusicIT {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy security;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    MockMvc mvc;
    final UUID adminId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
        if (jdbc.queryForObject("SELECT to_regclass('music_tracks') IS NOT NULL", Boolean.class)) {
            jdbc.update("DELETE FROM music_tracks");
        }
    }

    @Test
    void anonymousVisitorsSeeAnEmptyPlaylistBeforeTracksAreAdded() throws Exception {
        mvc.perform(get("/api/v1/music")).andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test
    void everyAdminOperationRejectsAnonymousAndOrdinaryUsers() throws Exception {
        String id = UUID.randomUUID().toString();
        for (boolean authenticated : List.of(false, true)) {
            for (var request : List.of(get("/api/v1/admin/music"), post("/api/v1/admin/music"),
                    put("/api/v1/admin/music/" + id), delete("/api/v1/admin/music/" + id))) {
                request.contentType("application/json").content(body("Track", "Artist", 0, true));
                if (authenticated) request.header("X-User-Id", UUID.randomUUID()).header("X-User-Roles", "ROLE_USER");
                mvc.perform(request).andExpect(status().isForbidden());
            }
        }
    }

    @Test
    void adminCreatesUpdatesDisablesReenablesAndDeletesPersistedTracks() throws Exception {
        JsonNode created = create(body("  Night drive  ", "  Artist  ", 9, true));
        String id = created.path("id").asText();
        assertThat(created.path("title").asText()).isEqualTo("Night drive");
        assertThat(created.path("artist").asText()).isEqualTo("Artist");
        assertThat(created.path("youtubeVideoId").asText()).isEqualTo("dQw4w9WgXcQ");
        assertThat(created.has("youtubeUrl")).isFalse();
        assertThat(jdbc.queryForObject("SELECT youtube_video_id FROM music_tracks WHERE id=?", String.class,
                UUID.fromString(id))).isEqualTo("dQw4w9WgXcQ");

        mvc.perform(admin(put("/api/v1/admin/music/" + id)).content(body("Changed", "", 1, false)
                        .replace("dQw4w9WgXcQ", "abcdefghijk")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Changed"))
                .andExpect(jsonPath("$.artist").value(""))
                .andExpect(jsonPath("$.youtubeVideoId").value("abcdefghijk"))
                .andExpect(jsonPath("$.sortOrder").value(1)).andExpect(jsonPath("$.enabled").value(false));
        mvc.perform(get("/api/v1/music")).andExpect(content().json("[]"));
        mvc.perform(admin(get("/api/v1/admin/music"))).andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].enabled").value(false));
        mvc.perform(admin(put("/api/v1/admin/music/" + id)).content(body("Changed", "", 1, true)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/music")).andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(admin(delete("/api/v1/admin/music/" + id))).andExpect(status().isNoContent());
        mvc.perform(admin(get("/api/v1/admin/music"))).andExpect(content().json("[]"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM music_tracks", Long.class)).isZero();
    }

    @Test
    void publicPlaylistFiltersDisabledTracksAndUsesStableOrderIncludingTies() throws Exception {
        String later = create(body("later", "", 5, true)).path("id").asText();
        String tieA = create(body("tie A", "", 2, true)).path("id").asText();
        String tieB = create(body("tie B", "", 2, true)).path("id").asText();
        String older = create(body("older", "", 2, true)).path("id").asText();
        String hidden = create(body("hidden", "", 0, false)).path("id").asText();
        jdbc.update("UPDATE music_tracks SET created_at='2026-01-02T00:00:00Z' WHERE id IN (?,?)",
                UUID.fromString(tieA), UUID.fromString(tieB));
        jdbc.update("UPDATE music_tracks SET created_at='2026-01-01T00:00:00Z' WHERE id=?", UUID.fromString(older));
        List<String> ties = List.of(tieA, tieB).stream().sorted().toList();
        mvc.perform(get("/api/v1/music")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].id").value(older))
                .andExpect(jsonPath("$[1].id").value(ties.get(0)))
                .andExpect(jsonPath("$[2].id").value(ties.get(1)))
                .andExpect(jsonPath("$[3].id").value(later));
        mvc.perform(admin(get("/api/v1/admin/music"))).andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].id").value(hidden));
    }

    @Test
    void absentTracksReturnNotFoundForUpdateAndDelete() throws Exception {
        String path = "/api/v1/admin/music/" + UUID.randomUUID();
        mvc.perform(admin(put(path)).content(body("Track", "", 0, true))).andExpect(status().isNotFound());
        mvc.perform(admin(delete(path))).andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10",
            "http://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
            "https://youtu.be/dQw4w9WgXcQ?si=shared", "https://youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://youtube.com/live/dQw4w9WgXcQ",
            " HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ "
    })
    void acceptedYoutubeUrlsPersistOnlyTheirCanonicalVideoId(String url) throws Exception {
        JsonNode created = create(json.writeValueAsString(Map.of("title", "Track", "youtubeUrl", url,
                "sortOrder", 0, "enabled", true)));
        assertThat(created.path("youtubeVideoId").asText()).isEqualTo("dQw4w9WgXcQ");
        assertThat(created.path("artist").asText()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://evil.test/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
            "https://notyoutube.com/watch?v=dQw4w9WgXcQ", "https://www.youtu.be/dQw4w9WgXcQ",
            "https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ", "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ",
            "ftp://youtube.com/watch?v=dQw4w9WgXcQ", "//youtube.com/watch?v=dQw4w9WgXcQ",
            "javascript:alert(1)", "https://youtube.com/playlist?list=PL123", "https://youtube.com/watch",
            "https://youtu.be/short", "https://youtu.be/dQw4w9WgXcQextra", "https://youtu.be/dQw4w9WgXcQ/extra",
            "https://youtube.com/shorts/dQw4w9WgXcQ/extra", "https://youtube.com/watch?v=dQw4w9WgXc!",
            "https://youtube.com/watch?v=dQw4w9WgXcQ&v=abcdefghijk", "https://youtube.com:1234/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=%64Qw4w9WgXcQ", "dQw4w9WgXcQ", ""
    })
    void unsupportedUrlsReturnBadRequestWithoutPersisting(String url) throws Exception {
        mvc.perform(admin(post("/api/v1/admin/music")).content(json.writeValueAsString(Map.of("title", "Track",
                        "youtubeUrl", url, "sortOrder", 0, "enabled", true))))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM music_tracks", Long.class)).isZero();
    }

    @Test
    void invalidFieldsAreRejectedOnCreateAndUpdateAndDoNotChangeSavedTrack() throws Exception {
        String id = create(body("Original", "Artist", 0, true)).path("id").asText();
        for (String invalid : List.of(
                "{\"title\":\"  \"}", "{\"title\":null}", "{\"title\":\"" + "x".repeat(121) + "\"}",
                "{\"artist\":\"" + "x".repeat(121) + "\"}", "{\"youtubeUrl\":null}",
                "{\"sortOrder\":-1}", "{\"sortOrder\":10001}", "{\"sortOrder\":null}", "{\"sortOrder\":1.5}",
                "{\"sortOrder\":\"1\"}", "{\"enabled\":null}", "{\"enabled\":\"true\"}")) {
            var request = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(body("Track", "", 0, true));
            request.setAll((com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(invalid));
            for (var method : List.of(post("/api/v1/admin/music"), put("/api/v1/admin/music/" + id))) {
                mvc.perform(admin(method).content(json.writeValueAsString(request))).andExpect(status().isBadRequest());
            }
        }
        for (String required : List.of("title", "youtubeUrl", "sortOrder", "enabled")) {
            var request = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(body("Track", "", 0, true));
            request.remove(required);
            mvc.perform(admin(post("/api/v1/admin/music")).content(json.writeValueAsString(request)))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(admin(get("/api/v1/admin/music"))).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("Original"));
    }

    private JsonNode create(String body) throws Exception {
        return json.readTree(mvc.perform(admin(post("/api/v1/admin/music")).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String body(String title, String artist, int sortOrder, boolean enabled) throws Exception {
        return json.writeValueAsString(Map.of("title", title, "artist", artist, "youtubeUrl",
                "https://youtu.be/dQw4w9WgXcQ", "sortOrder", sortOrder, "enabled", enabled));
    }

    private MockHttpServletRequestBuilder admin(MockHttpServletRequestBuilder request) {
        return request.header("X-User-Id", adminId).header("X-User-Roles", "ROLE_ADMIN")
                .contentType("application/json");
    }

    @org.springframework.boot.test.context.TestConfiguration
    @EnableWebMvc
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackages = "uz.efbazaar.marketplace.music")
    @ComponentScan(value = "uz.efbazaar.marketplace.music", excludeFilters = @ComponentScan.Filter(
            type = FilterType.ANNOTATION, classes = org.springframework.boot.test.context.TestConfiguration.class))
    @Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class, GlobalExceptionHandler.class})
    static class Config {
        @Bean
        DataSource dataSource() {
            var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
            Flyway.configure().dataSource(ds).load().migrate();
            return ds;
        }

        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean JpaTransactionManager transactionManager(jakarta.persistence.EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            var factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(ds);
            factory.setPackagesToScan("uz.efbazaar.marketplace.music");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate"));
            return factory;
        }
    }
}
