-- ============================================================================
-- 001_social_videos.sql
--
-- Creates the social_videos table that rahasya-video-generation writes to.
-- This is the ONLY schema object this repository owns. It does not touch
-- marketing_content or any other existing table.
--
-- The instagram_published / facebook_published / youtube_published /
-- tiktok_published columns are intentionally included so that the
-- (separate, not-built-here) social-distribution-engine has somewhere to
-- record publish state later. This repo never sets them to true itself.
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_videos (
    id                          BIGSERIAL PRIMARY KEY,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    marketing_content_id        BIGINT NOT NULL,
    horoscope_date              DATE,
    sign                        TEXT,
    mood                        TEXT,

    video_url                   TEXT,

    instagram_published         BOOLEAN NOT NULL DEFAULT FALSE,
    instagram_published_at      TIMESTAMPTZ,

    facebook_published          BOOLEAN NOT NULL DEFAULT FALSE,
    facebook_published_at       TIMESTAMPTZ,

    youtube_published           BOOLEAN NOT NULL DEFAULT FALSE,
    youtube_published_at        TIMESTAMPTZ,

    tiktok_published            BOOLEAN NOT NULL DEFAULT FALSE,
    tiktok_published_at         TIMESTAMPTZ,

    processing                  BOOLEAN NOT NULL DEFAULT FALSE,
    processing_started_at       TIMESTAMPTZ,

    CONSTRAINT fk_social_videos_marketing_content
        FOREIGN KEY (marketing_content_id)
        REFERENCES marketing_content (id)
        ON DELETE CASCADE
);

-- One video per marketing_content row. This is what makes batch
-- processing idempotent: re-running `npm run generate` will simply
-- skip rows that already have a social_videos entry (see
-- src/services/socialVideoRepo.ts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_videos_marketing_content_id
    ON social_videos (marketing_content_id);

CREATE INDEX IF NOT EXISTS idx_social_videos_sign_mood
    ON social_videos (sign, mood);

CREATE INDEX IF NOT EXISTS idx_social_videos_horoscope_date
    ON social_videos (horoscope_date);

CREATE INDEX IF NOT EXISTS idx_social_videos_processing
    ON social_videos (processing)
    WHERE processing = TRUE;

COMMENT ON TABLE social_videos IS
    'One row per generated short-form vertical video, produced from a marketing_content row by rahasya-video-generation. Publishing flags are written by the (separate) social-distribution-engine.';

-- ============================================================================
-- Storage bucket
--
-- The Supabase JS client cannot create storage buckets via SQL migrations;
-- create it once via the Supabase dashboard (Storage -> New bucket) or with
-- the snippet below run via the Supabase SQL editor (requires the storage
-- extension, available by default on Supabase projects):
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-videos', 'social-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read of generated videos (bucket is public; no public write).
CREATE POLICY IF NOT EXISTS "Public read access for social-videos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'social-videos');

-- Only the service role (used by this repo's worker) can write/delete.
-- No INSERT/UPDATE/DELETE policy is created for anon/authenticated roles,
-- so writes are restricted to the service role key by default.
