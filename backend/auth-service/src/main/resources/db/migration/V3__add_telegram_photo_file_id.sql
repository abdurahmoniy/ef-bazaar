-- Mini App initData does not include photo_url (only attachment-menu launches do),
-- so the bot fetches the user's profile photo via getUserProfilePhotos after register,
-- forwards it into the media topic, and publishes back the resulting file_id +
-- message_id. Auth-service stores both: file_id powers the /me/photo proxy
-- endpoint, message_id is kept as an audit pointer into the media topic.

ALTER TABLE users
    ADD COLUMN telegram_photo_file_id    VARCHAR(256),
    ADD COLUMN telegram_photo_message_id BIGINT;
