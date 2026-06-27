import { SupabaseClient } from "@supabase/supabase-js";
import { SocialVideoInsert } from "../types/socialVideo";
import { logger } from "../utils/logger";

/**
 * Inserts a completed video record into social_videos.
 *
 * Uses `upsert` on the unique constraint (marketing_content_id) so that
 * re-running the pipeline after a partial failure updates the existing row
 * (e.g. a row left with processing=true and no video_url gets a final URL).
 */
export async function insertSocialVideo(
  supabase: SupabaseClient,
  data: SocialVideoInsert
): Promise<void> {
  const { error } = await supabase.from("social_videos").upsert(
    {
      marketing_content_id: data.marketing_content_id,
      horoscope_date: data.horoscope_date,
      sign: data.sign,
      mood: data.mood,
      video_url: data.video_url,
      processing: false,
      processing_started_at: null,
    },
    {
      onConflict: "marketing_content_id",
    }
  );

  if (error) {
    throw new Error(
      `Failed to insert social_videos row for marketing_content_id=${data.marketing_content_id}: ${error.message}`
    );
  }

  logger.info("social_videos row upserted", {
    marketing_content_id: data.marketing_content_id,
    sign: data.sign,
    mood: data.mood,
    video_url: data.video_url,
  });
}

/**
 * Marks a row as currently being processed.
 * This is a best-effort write — it prevents a second concurrent run from
 * picking up the same row, but this pipeline is designed for sequential
 * GitHub Actions runs so it is mostly informational.
 */
export async function markProcessingStarted(
  supabase: SupabaseClient,
  marketingContentId: number
): Promise<void> {
  const { error } = await supabase.from("social_videos").upsert(
    {
      marketing_content_id: marketingContentId,
      processing: true,
      processing_started_at: new Date().toISOString(),
      video_url: null,
    },
    { onConflict: "marketing_content_id" }
  );

  if (error) {
    // Non-fatal — log and continue.
    logger.warn("Could not mark processing_started", {
      marketingContentId,
      error: error.message,
    });
  }
}

/**
 * Returns true if social_videos already has a completed row
 * (video_url IS NOT NULL) for the given marketing_content_id.
 */
export async function isAlreadyProcessed(
  supabase: SupabaseClient,
  marketingContentId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from("social_videos")
    .select("id, video_url")
    .eq("marketing_content_id", marketingContentId)
    .not("video_url", "is", null)
    .maybeSingle();

  if (error) {
    logger.warn("isAlreadyProcessed query failed, assuming not processed", {
      marketingContentId,
      error: error.message,
    });
    return false;
  }

  return data !== null;
}
