/**
 * generateVideos.ts  — `npm run generate`
 *
 * The production batch command. Reads pending marketing_content rows and
 * generates an MP4 for each one, uploading to Supabase and recording the
 * result in social_videos.
 *
 * Default behaviour (zero-argument, cron-friendly):
 *   1. Run preflight checks (FFmpeg, FFprobe, Piper binary + voice model,
 *      fonts) and fail fast with a clear error if anything is missing.
 *   2. Auto-resolve the latest non-NULL horoscope_date in marketing_content
 *      and process only that day's rows. Legacy rows with a NULL
 *      horoscope_date are NEVER processed.
 *
 * CLI flags:
 *   --limit=N           Process at most N rows (default: DEFAULT_BATCH_LIMIT env var)
 *   --sign=aries        Filter by zodiac sign
 *   --mood=peaceful     Filter by mood
 *   --date=YYYY-MM-DD   Process a specific date instead of auto-resolving "today"
 *   --all-dates         Escape hatch: disable date auto-resolution, process any pending date
 *   --force             Re-process rows that already have a social_videos entry
 *
 * Examples:
 *   npm run generate                          # today's batch, auto-resolved
 *   npm run generate -- --limit=1
 *   npm run generate -- --sign=cancer --mood=ambitious
 *   npm run generate -- --date=2026-07-10
 *   npm run generate -- --all-dates --limit=36
 */

import * as dotenv from "dotenv";
dotenv.config();

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadConfig } from "../config/env";
import { getSupabaseClient } from "../services/supabase";
import { fetchPendingRows, fetchLatestHoroscopeDate } from "../services/marketingContentRepo";
import { uploadVideo } from "../services/storage";
import { insertSocialVideo, markProcessingStarted } from "../services/socialVideoRepo";
import { generateVideo } from "../generators/videoGenerator";
import { runPreflightChecks, PreflightError } from "../utils/preflight";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const argv = yargs(hideBin(process.argv))
  .option("limit", {
    type: "number",
    description: "Maximum number of videos to generate in this run",
  })
  .option("sign", {
    type: "string",
    description: "Filter by zodiac sign (e.g. aries, cancer)",
  })
  .option("mood", {
    type: "string",
    description: "Filter by mood (e.g. peaceful, ambitious)",
  })
  .option("date", {
    type: "string",
    description: "Filter by horoscope date (YYYY-MM-DD). Default: auto-resolved to the latest date.",
  })
  .option("all-dates", {
    type: "boolean",
    default: false,
    description: "Disable date auto-resolution and process any pending date (escape hatch)",
  })
  .option("force", {
    type: "boolean",
    default: false,
    description: "Re-process rows that already have a social_videos entry",
  })
  .help()
  .parseSync();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();

  // ── Preflight: fail fast, before touching Supabase or spawning anything ──
  try {
    await runPreflightChecks(config);
  } catch (err) {
    if (err instanceof PreflightError) {
      logger.error(err.message);
    } else {
      logger.error("Preflight checks crashed unexpectedly", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    process.exit(1);
  }

  const supabase = getSupabaseClient(config);

  const limit = argv.limit ?? config.defaultBatchLimit;
  const sign = argv.sign;
  const mood = argv.mood;
  const force = argv.force;
  const allDates = argv.allDates;

  // ── Resolve which date to process ────────────────────────────────────────
  let date = argv.date;
  if (!date && !allDates) {
    date = (await fetchLatestHoroscopeDate(supabase)) ?? undefined;
    if (!date) {
      logger.info("No dated marketing_content rows found at all. Nothing to do.");
      process.exit(0);
    }
    logger.info(`Auto-resolved latest horoscope_date: ${date}`);
  }

  logger.info("=== Rahasya Video Generation — batch start ===", {
    limit,
    sign: sign ?? "(all)",
    mood: mood ?? "(all)",
    date: date ?? "(all dates — --all-dates set)",
    force,
  });

  // ── Fetch rows ─────────────────────────────────────────────────────────────
  const rows = await fetchPendingRows(supabase, {
    sign,
    mood,
    date,
    limit,
    force,
  });

  if (rows.length === 0) {
    logger.info("No pending rows found. Nothing to do.");
    logger.info("=== Rahasya Video Generation — done (0 videos) ===");
    process.exit(0);
  }

  // ── Process each row ───────────────────────────────────────────────────────
  let successCount = 0;
  let failureCount = 0;
  const failures: Array<{ id: number; sign: string; mood: string; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    logger.info(`Processing row ${i + 1}/${rows.length}`, {
      id: row.id,
      sign: row.sign,
      mood: row.mood,
      horoscope_date: row.horoscope_date,
    });

    try {
      // Mark as in-progress (best-effort, non-fatal)
      await markProcessingStarted(supabase, row.id);

      await generateVideo(row, config, {
        skipUpload: false,

        uploadFn: (localPath, rowSign, rowMood, rowDate) =>
          uploadVideo(supabase, localPath, rowSign, rowMood, rowDate, config),

        insertFn: (marketingContentId, rowSign, rowMood, rowDate, videoUrl) =>
          insertSocialVideo(supabase, {
            marketing_content_id: marketingContentId,
            sign: rowSign,
            mood: rowMood,
            horoscope_date: rowDate,
            video_url: videoUrl,
          }),
      });

      successCount++;
    } catch (err) {
      failureCount++;
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Row failed — continuing to next row", {
        id: row.id,
        sign: row.sign,
        mood: row.mood,
        error: message,
      });
      failures.push({ id: row.id, sign: row.sign, mood: row.mood, error: message });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  logger.info("=== Rahasya Video Generation — batch complete ===", {
    total: rows.length,
    success: successCount,
    failed: failureCount,
  });

  if (failures.length > 0) {
    logger.error("Failed rows:", { failures });
    process.exit(1); // Signal failure to GitHub Actions
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error("Fatal error in generate command", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
