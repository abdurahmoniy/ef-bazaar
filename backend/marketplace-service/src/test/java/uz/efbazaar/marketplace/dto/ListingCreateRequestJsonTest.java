package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Frontend yuborgan JSON aynan qanday o'qilishini qo'riqlaydi.
 *
 * <p>Kanal tanlangan e'lon kanalga chiqmagan va bazada birorta ham
 * buyurtma qatori paydo bo'lmagan edi: ro'yxat serverga bo'sh
 * yetib borgan. Bu sinov shu yo'lni butunlay yopadi.
 */
class ListingCreateRequestJsonTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    @DisplayName("channelIds JSON'dan o'qiladi")
    void channelIdsSurviveDeserialisation() throws Exception {
        String body = """
                {"description":"Akkaunt","price":179000,"priceNegotiable":false,
                 "attributes":{"android_coins":0},
                 "channelIds":["b298c910-2688-4be0-b01b-962756348d25"]}
                """;

        ListingCreateRequest request = json.readValue(body, ListingCreateRequest.class);

        assertThat(request.channelIds())
                .as("kanal tanlovi serverga yetib borishi kerak")
                .containsExactly(java.util.UUID.fromString("b298c910-2688-4be0-b01b-962756348d25"));
    }

    @Test
    @DisplayName("channelIds yuborilmasa null bo'ladi, xato emas")
    void anOlderClientWithoutChannelsStillWorks() throws Exception {
        String body = """
                {"description":"Akkaunt","price":179000,"priceNegotiable":false,
                 "attributes":{}}
                """;

        ListingCreateRequest request = json.readValue(body, ListingCreateRequest.class);

        assertThat(request.channelIds()).isNull();
    }
}
