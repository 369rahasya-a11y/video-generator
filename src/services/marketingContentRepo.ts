import { SupabaseClient } from "@supabase/supabase-js";
import { MarketingContentRow, MarketingContentFilter } from "../types/marketingContent";
import { logger } from "../utils/logger";

/**
 * Fetches marketing_content rows that do NOT yet have a social_videos entry,
 * applying optional sign/mood/limit filters.
 *
 * Idempotency guarantee:
 *   Rows that already have a matching row in social_videos are skipped.
 *   Pass `force: true` to re-process them (useful for re-renders).
 *
 * This repository ONLY reads marketing_content — it never writes to it.
 */
export async function fetchPendingRows(
  supabase: SupabaseClient,
  filter: MarketingContentFilter = {}
): Promise<MarketingContentRow[]> {
  const { sign, mood, date, limit, force = false } = filter;
  // ── Step 1: collect already-processed IDs ─────────────────────────────────
  let processedIds: number[] = [];

  if (!force) {
    const { data: existing, error: existingError } = await supabase
      .from("social_videos")
      .select("marketing_content_id");

    if (existingError) {
      throw new Error(
        `Failed to query social_videos for idempotency check: ${existingError.message}`
      );
    }

    processedIds = (existing ?? []).map(
      (r: { marketing_content_id: number }) => r.marketing_content_id
    );
  }

  logger.info("Fetching pending marketing_content rows", {
    alreadyProcessed: processedIds.length,
    filter: { sign, mood, date, limit, force },
  });

  // ── Step 2: query marketing_content excluding processed IDs ───────────────
  // NOTE: reel_script is intentionally NOT selected — it is deprecated as of
  // Migration 007. Narration and story text come exclusively from the
  // video_story_* fields.
  // Determine latest non-NULL horoscope_date
let latestDate: string | undefined;

if (!date) {
  const { data: latestRows, error: latestError } = await supabase
    .from("marketing_content")
    .select("horoscope_date")
    .not("horoscope_date", "is", null)
    .order("horoscope_date", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new Error(
      `Failed to determine latest horoscope_date: ${latestError.message}`
    );
  }

  latestDate = latestRows?.[0]?.horoscope_date;

  if (!latestDate) {
    throw new Error("No valid horoscope_date found in marketing_content.");
  }
}
  let query = supabase
    .from("marketing_content")
    .select(
      "id, marketing_horoscope_id, sign, mood, card_text, reel_hook, caption, hashtags, created_at, card_hook, horoscope_date, video_story_hook, video_story_relatable_moment, video_story_emotional_realization, video_story_horoscope_connection, video_story_open_ending, video_story_website_cta"
    )
    .not("horoscope_date", "is", null)
    .order("horoscope_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (sign) {
    query = query.ilike("sign", sign.trim());
  }
  if (mood) {
    query = query.ilike("mood", mood.trim());
  }
  if (date) {
  query = query.eq("horoscope_date", date.trim());
  }else {
  query = query.eq("horoscope_date", latestDate!);
  }
  if (processedIds.length > 0) {
    query = query.not("id", "in", `(${processedIds.join(",")})`);
  }
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch marketing_content rows: ${error.message}`);
  }

  const rows = (data ?? []) as MarketingContentRow[];

  // Guard: ensure all six Migration 007 video_story_* fields are present and
  // non-empty. Fail gracefully (skip + log) rather than crashing the batch.
  const REQUIRED_STORY_FIELDS: Array<keyof MarketingContentRow> = [
    "video_story_hook",
    "video_story_relatable_moment",
    "video_story_emotional_realization",
    "video_story_horoscope_connection",
    "video_story_open_ending",
    "video_story_website_cta",
  ];

  const valid = rows.filter((row) => {
    const missing = REQUIRED_STORY_FIELDS.filter(
      (field) => !String(row[field] ?? "").trim()
    );
    if (missing.length > 0) {
      logger.warn("Skipping row with missing Marketing AI V2 story field(s)", {
        id: row.id,
        sign: row.sign,
        mood: row.mood,
        missingFields: missing,
      });
      return false;
    }
    return true;
  });

  logger.info(`Found ${valid.length} pending row(s) to process`);
  return valid;
}

/**
 * Fetches exactly one marketing_content row — used by `npm run test-video`.
 * Throws if no matching row is found.
 */
export async function fetchOneRow(
  supabase: SupabaseClient,
  filter: Pick<MarketingContentFilter, "sign" | "mood"> = {}
): Promise<MarketingContentRow> {
  const rows = await fetchPendingRows(supabase, {
    ...filter,
    limit: 1,
    force: false,
  });

  if (rows.length === 0) {
    const desc = [
      filter.sign ? `sign=${filter.sign}` : null,
      filter.mood ? `mood=${filter.mood}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `No pending marketing_content rows found` +
        (desc ? ` matching ${desc}` : "") +
        `. All rows may already have been processed. ` +
        `Run with --force to re-process existing rows.`
    );
  }

  return rows[0];
}
