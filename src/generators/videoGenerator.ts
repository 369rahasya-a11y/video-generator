/**
 * videoGenerator.ts
 *
 * Orchestrates the complete pipeline for generating ONE video from a single
 * MarketingContentRow.
 *
 * Flow:
 *   buildVideoPlan (narration + timing) -> renderVideo -> uploadVideo -> insertSocialVideo -> cleanup
 *
 * The `skipUpload` flag is used by the preview command so you can iterate on
 * fonts/layout/timing without touching Supabase.
 */

import * as path from "path";
import * as fs from "fs";
import { AppConfig } from "../config/env";
import { MarketingContentRow } from "../types/marketingContent";
import { buildVideoPlan } from "../generators/scenePlanner";
import { renderVideo } from "../renderers/sceneRenderer";
import { resolveFonts } from "../utils/fontResolver";
import { createJobDir, cleanupDir, buildVideoFilename } from "../utils/tempFiles";
import { withRetry } from "../utils/retry";
import { logger } from "../utils/logger";
import { TTSProvider } from "../tts/ttsProvider";
import { PiperProvider } from "../tts/piperProvider";

// Lazy-resolved fonts -- resolved once per process, shared across all videos.
let _fonts: ReturnType<typeof resolveFonts> | null = null;
function getFonts() {
  if (!_fonts) _fonts = resolveFonts();
  return _fonts;
}

// Lazy-resolved TTS provider -- resolved once per process, shared across all
// videos. Swapping to a different offline provider later only requires
// changing this one line (both must implement TTSProvider).
let _tts: TTSProvider | null = null;
function getTTSProvider(config: AppConfig): TTSProvider {
  if (!_tts) _tts = new PiperProvider(config);
  return _tts;
}

export interface GenerateOptions {
  /** When true, skip Supabase upload and DB insert (preview/dev mode). */
  skipUpload?: boolean;
  /**
   * If skipUpload is false, these are required.
   * They're typed as optional here so the caller can pass them conditionally.
   */
  uploadFn?: (localPath: string, sign: string, mood: string, date: string | null) => Promise<string>;
  insertFn?: (marketingContentId: number, sign: string, mood: string, date: string | null, videoUrl: string) => Promise<void>;
}

export interface GenerateResult {
  marketingContentId: number;
  sign: string;
  mood: string;
  /** Absolute local path of the produced MP4 (deleted after upload unless skipUpload). */
  localPath: string;
  /** Public Supabase URL, or null when skipUpload=true. */
  videoUrl: string | null;
  renderTimeSeconds: number;
}

/**
 * Generates one video for the given marketing_content row.
 *
 * On error, cleans up temp files and re-throws. The caller (generateVideos.ts)
 * catches this per-row so one failed narration/render never aborts the batch.
 */
export async function generateVideo(
  row: MarketingContentRow,
  config: AppConfig,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { skipUpload = false, uploadFn, insertFn } = options;
  const jobDir = createJobDir(config.tmpDir);

  try {
    // 1. Plan (builds narration via Piper TTS + derives scene timing from it)
    const tts = getTTSProvider(config);
    const plan = await withRetry(
      () => buildVideoPlan(row, config, jobDir, tts),
      { retries: 2, baseDelayMs: 1500, label: `narration+plan:${row.sign}:${row.mood}` }
    );

    logger.info("Video plan built", {
      sign: plan.sign,
      mood: plan.mood,
      scenes: plan.scenes.map((s) => ({
        name: s.name,
        start: s.start.toFixed(2),
        duration: s.duration.toFixed(2),
      })),
      totalDuration: plan.totalDuration.toFixed(2),
    });

    // 2. Render
    const fonts = getFonts();
    const filename = buildVideoFilename(row.sign, row.mood);
    const outputPath = path.join(jobDir, filename);

    const { renderTimeSeconds } = await withRetry(
      () => renderVideo(plan, fonts, jobDir, outputPath, config),
      { retries: 2, baseDelayMs: 2000, label: `render:${row.sign}:${row.mood}` }
    );

    let videoUrl: string | null = null;

    if (!skipUpload) {
      if (!uploadFn || !insertFn) {
        throw new Error(
          "uploadFn and insertFn must be provided when skipUpload=false"
        );
      }

      // 3. Upload
      videoUrl = await withRetry(
        () => uploadFn(outputPath, row.sign, row.mood, row.horoscope_date),
        { retries: 3, baseDelayMs: 1000, label: `upload:${row.sign}:${row.mood}` }
      );

      // 4. DB insert
      await withRetry(
        () =>
          insertFn(
            row.id,
            row.sign,
            row.mood,
            row.horoscope_date,
            videoUrl!
          ),
        { retries: 3, baseDelayMs: 500, label: `insert:${row.sign}:${row.mood}` }
      );

      logger.info("Video pipeline complete", {
        sign: row.sign,
        mood: row.mood,
        videoUrl,
      });

      // 5. Delete local temp file after successful upload
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // Non-fatal -- temp dir cleanup handles it
      }
    } else {
      // Preview mode: move to output/ with a recognisable name
      const previewPath = path.join(
        config.outputDir,
        `preview_${buildVideoFilename(row.sign, row.mood)}`
      );
      fs.copyFileSync(outputPath, previewPath);
      logger.info("Preview video saved (no upload)", { previewPath });
    }

    return {
      marketingContentId: row.id,
      sign: row.sign,
      mood: row.mood,
      localPath: outputPath,
      videoUrl,
      renderTimeSeconds,
    };
  } finally {
    cleanupDir(jobDir);
  }
}
