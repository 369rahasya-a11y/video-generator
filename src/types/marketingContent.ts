/**
 * Mirrors the `marketing_content` table after Migration 007 (Marketing AI V2
 * schema). This repository only ever READS this table — never writes to it.
 * Columns beyond the ones we actively use are kept optional/typed loosely
 * since other repos own that schema.
 *
 * NOTE: `reel_script` is DEPRECATED as of Migration 007. The Video Generator
 * must never read or use it — narration and on-screen story text are now
 * assembled exclusively from the six `video_story_*` fields below.
 */
export interface MarketingContentRow {
  id: number;
  marketing_horoscope_id: number | null;
  sign: string;
  mood: string;
  card_text: string | null;
  reel_hook: string;
  /** @deprecated Migration 007 — do not read or use. Retained only because the column still exists in the DB row shape. */
  reel_script?: string;
  caption: string | null;
  hashtags: string[] | null;
  created_at: string;
  card_hook: string | null;
  horoscope_date: string | null;

  // ── Marketing AI V2 story fields (Migration 007) ─────────────────────────
  // These six fields are assembled, in this order, into the video narration.
  // Content is never rewritten, summarized, or paraphrased by this pipeline.
  video_story_hook: string;
  video_story_relatable_moment: string;
  video_story_emotional_realization: string;
  video_story_horoscope_connection: string;
  video_story_open_ending: string;
  video_story_website_cta: string;
}

/** The six video_story_* fields, in narration order. Used throughout the pipeline. */
export const VIDEO_STORY_FIELDS = [
  "video_story_hook",
  "video_story_relatable_moment",
  "video_story_emotional_realization",
  "video_story_horoscope_connection",
  "video_story_open_ending",
  "video_story_website_cta",
] as const;

export type VideoStoryField = (typeof VIDEO_STORY_FIELDS)[number];

export interface MarketingContentFilter {
  sign?: string;
  mood?: string;
  date?: string;
  limit?: number;
  /** When false (default), rows that already have a social_videos entry are skipped. */
  force?: boolean;
}
