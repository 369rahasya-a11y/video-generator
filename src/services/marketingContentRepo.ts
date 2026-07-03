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
  const { sign, mood, limit, force = false } = filter;

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
    filter: { sign, mood, limit, force },
  });

  // ── Step 2: query marketing_content excluding processed IDs ───────────────
  let query = supabase
    .from("marketing_content")
    .select(
      "id, marketing_horoscope_id, sign, mood, card_text, reel_hook, reel_script, caption, created_at, card_hook, horoscope_date"
    )
    .order("horoscope_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (sign) {
    query = query.ilike("sign", sign.trim());
  }
  if (mood) {
    query = query.ilike("mood", mood.trim());
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

  // Guard: ensure reel_hook and reel_script are non-empty
  const valid = rows.filter((row) => {
    if (!row.reel_hook?.trim() || !row.reel_script?.trim()) {
      logger.warn("Skipping row with empty reel_hook or reel_script", {
        id: row.id,
        sign: row.sign,
        mood: row.mood,
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
