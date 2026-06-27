/**
 * generateVideos.ts  — `npm run generate`
 *
 * The production batch command. Reads pending marketing_content rows and
 * generates an MP4 for each one, uploading to Supabase and recording the
 * result in social_videos.
 *
 * CLI flags:
 *   --limit=N           Process at most N rows (default: DEFAULT_BATCH_LIMIT env var)
 *   --sign=aries        Filter by zodiac sign
 *   --mood=peaceful     Filter by mood
 *   --force             Re-process rows that already have a social_videos entry
 *
 * Examples:
 *   npm run generate
 *   npm run generate -- --limit=1
 *   npm run generate -- --limit=5
 *   npm run generate -- --sign=cancer --mood=ambitious
 *   npm run generate -- --limit=36
 */

import * as dotenv from "dotenv";
dotenv.config();

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadConfig } from "../config/env";
import { getSupabaseClient } from "../services/supabase";
import { fetchPendingRows } from "../services/marketingContentRepo";
import { uploadVideo } from "../services/storage";
import { insertSocialVideo, markProcessingStarted } from "../services/socialVideoRepo";
import { generateVideo } from "../generators/videoGenerator";
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
  const supabase = getSupabaseClient(config);

  const limit = argv.limit ?? config.defaultBatchLimit;
  const sign = argv.sign;
  const mood = argv.mood;
  const force = argv.force;

  logger.info("=== Rahasya Video Generation — batch start ===", {
    limit,
    sign: sign ?? "(all)",
    mood: mood ?? "(all)",
    force,
  });

  // ── Fetch rows ─────────────────────────────────────────────────────────────
  const rows = await fetchPendingRows(supabase, {
    sign,
    mood,
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
