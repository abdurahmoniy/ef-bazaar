package uz.efbazaar.trade.mailbox.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RenameMailboxRequest(@NotNull @Size(max = 60) String displayName) {
    @JsonCreator
    public static RenameMailboxRequest fromJson(@JsonProperty("displayName") JsonNode displayName) {
        if (displayName == null || displayName.isNull()) {
            return new RenameMailboxRequest(null);
        }
        if (!displayName.isTextual()) {
            throw new IllegalArgumentException("displayName must be a string");
        }
        return new RenameMailboxRequest(displayName.textValue());
    }

    public RenameMailboxRequest {
        if (displayName != null) {
            displayName = displayName.strip();
        }
    }
}
