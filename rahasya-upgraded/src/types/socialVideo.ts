/**
 * Mirrors the `social_videos` table created by sql/001_social_videos.sql.
 * This repository creates and updates rows here but never sets the
 * *_published flags — those belong to social-distribution-engine.
 */
export interface SocialVideoRow {
  id?: number;
  created_at?: string;

  marketing_content_id: number;
  horoscope_date: string | null;
  sign: string;
  mood: string;

  video_url: string | null;

  instagram_published?: boolean;
  instagram_published_at?: string | null;

  facebook_published?: boolean;
  facebook_published_at?: string | null;

  youtube_published?: boolean;
  youtube_published_at?: string | null;

  tiktok_published?: boolean;
  tiktok_published_at?: string | null;

  processing?: boolean;
  processing_started_at?: string | null;
}

export interface SocialVideoInsert {
  marketing_content_id: number;
  horoscope_date: string | null;
  sign: string;
  mood: string;
  video_url: string;
}
