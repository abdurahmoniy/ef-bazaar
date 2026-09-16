package uz.efbazaar.marketplace.push;

import java.util.Map;

public interface PushSender {
    enum Result { SENT, INVALID_TOKEN, RETRY_LATER }
    Result send(String token, Map<String, String> data);
}
