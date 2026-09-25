-- A key is scoped to its chat and authenticated sender. NULL keeps legacy sends unchanged.
ALTER TABLE chat_messages ADD COLUMN client_message_id UUID;
CREATE UNIQUE INDEX uk_chat_messages_client_key
    ON chat_messages (chat_id, sender_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

-- Deliberately no message FK: deleting a message must retain its consumed retry key.
CREATE TABLE chat_message_sends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    client_message_id UUID NOT NULL,
    message_id UUID NOT NULL,
    CONSTRAINT uk_chat_message_sends_key UNIQUE (chat_id, sender_id, client_message_id)
);
