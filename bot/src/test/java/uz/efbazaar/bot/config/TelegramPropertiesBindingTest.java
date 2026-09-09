package uz.efbazaar.bot.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class TelegramPropertiesBindingTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration.class)
            .withPropertyValues(
                    "app.telegram.bot-token=test-token",
                    "app.telegram.topics.logs=16",
                    "app.telegram.topics.registration=14",
                    "app.telegram.topics.media=12");

    @Test
    void bindsAllConfiguredTopics() {
        contextRunner.withPropertyValues(
                "app.telegram.topics.payments=18",
                "app.telegram.topics.support=20"
        ).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(TelegramProperties.class).topics())
                    .isEqualTo(new TelegramProperties.Topics(16, 14, 12, 18, 20));
        });
    }

    @Test
    void bindsMediaWhenOptionalTopicsAreAbsent() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(TelegramProperties.class).topics())
                    .isEqualTo(new TelegramProperties.Topics(16, 14, 12, null, null));
        });
    }

    @Test
    void bindsMediaWhenOptionalTopicValuesAreBlank() {
        contextRunner.withPropertyValues(
                "app.telegram.topics.payments=",
                "app.telegram.topics.support="
        ).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(TelegramProperties.class).topics())
                    .isEqualTo(new TelegramProperties.Topics(16, 14, 12, null, null));
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(TelegramProperties.class)
    static class TestConfiguration {}
}
