-- Only canonical YouTube video IDs are stored; audio/video bytes remain at the provider.
CREATE TABLE music_tracks (
    id               UUID         PRIMARY KEY,
    title            VARCHAR(120) NOT NULL CHECK (length(btrim(title)) > 0),
    artist           VARCHAR(120) NOT NULL DEFAULT '',
    youtube_video_id VARCHAR(11)  NOT NULL CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
    sort_order       INTEGER      NOT NULL CHECK (sort_order BETWEEN 0 AND 10000),
    enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_music_tracks_enabled_order ON music_tracks (sort_order, created_at, id) WHERE enabled;
