/**
 * sceneRenderer.ts — Video Render Orchestrator
 *
 * Coordinates one complete video render:
 *   1. Ensure the theme background PNG exists (generated once per theme per session)
 *   2. Write all per-scene content text files to the job temp directory
 *   3. Discover music track (or use synthetic fallback)
 *   4. Build the complete FFmpeg argument list
 *   5. Execute FFmpeg and verify output
 *
 * This module is fully decoupled from Supabase — it only produces a local MP4.
 * The caller (videoGenerator.ts) handles upload and database persistence.
 */

import * as fs from "fs";
import * as path from "path";
import { AppConfig } from "../config/env";
import { VideoPlan } from "../types/scene";
import { buildFilterComplex, SceneTextFiles, GOLD_RULE } from "./textRenderer";
import { ResolvedFonts } from "../utils/fontResolver";
import { runFFmpeg } from "../utils/ffmpegRunner";
import { getZodiacInfo } from "../utils/zodiac";
import { logger } from "../utils/logger";
import { ensureBackground } from "../engines/backgroundEngine";
import { selectMusicTrack, buildRealMusicFilter, buildSyntheticAudioFilter } from "../engines/musicEngine";

/** Result returned to the caller after a successful render. */
export interface RenderedVideo {
  outputPath: string;
  durationSeconds: number;
  renderTimeSeconds: number;
}

// ---------------------------------------------------------------------------
// Mood formatting
// ---------------------------------------------------------------------------

/**
 * Formats the raw mood string into a display label.
 * Single word  → capitalised ("peaceful" → "Peaceful")
 * Multiple (comma/semicolon separated) → "Word · Word · Word"
 */
function formatMoodDisplay(mood: string): string {
  return mood
    .trim()
    .split(/[,;/]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Text file writing
// ---------------------------------------------------------------------------

function writeText(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Writes all per-scene text content to the job temp directory.
 * Returns the SceneTextFiles map of file paths consumed by textRenderer.ts.
 */
function writeSceneTextFiles(
  jobDir: string,
  plan: VideoPlan,
  config: AppConfig
): SceneTextFiles {
  const { symbol, display } = getZodiacInfo(plan.sign);
  const moodDisplay = formatMoodDisplay(plan.mood);

  // CTA text: combine mainText + optional subText
  const ctaTextContent = plan.cta.subText
    ? `${plan.cta.mainText}\n${plan.cta.subText}`
    : plan.cta.mainText;

  const files: SceneTextFiles = {
    brand1:      path.join(jobDir, "brand1.txt"),
    brand2:      path.join(jobDir, "brand2.txt"),
    s1Symbol:    path.join(jobDir, "s1_symbol.txt"),
    s1Sign:      path.join(jobDir, "s1_sign.txt"),
    s1Mood:      path.join(jobDir, "s1_mood.txt"),
    s1Hook:      path.join(jobDir, "s1_hook.txt"),
    s2Script:    path.join(jobDir, "s2_script.txt"),
    s3Script:    path.join(jobDir, "s3_script.txt"),
    s4CtaSymbol: path.join(jobDir, "s4_cta_symbol.txt"),
    s4CtaText:   path.join(jobDir, "s4_cta_text.txt"),
    s4Sep:       path.join(jobDir, "s4_sep.txt"),
    s4Brand:     path.join(jobDir, "s4_brand.txt"),
    s4Url:       path.join(jobDir, "s4_url.txt"),
  };

  writeText(files.brand1,      "DISCOVER");
  writeText(files.brand2,      "RAHASYA");
  writeText(files.s1Symbol,    symbol);
  writeText(files.s1Sign,      display.toUpperCase());
  writeText(files.s1Mood,      moodDisplay);
  writeText(files.s1Hook,      plan.cardHook);
  writeText(files.s2Script,    plan.scriptPart1);
  writeText(files.s3Script,    plan.scriptPart2);
  writeText(files.s4CtaSymbol, plan.cta.symbol);
  writeText(files.s4CtaText,   ctaTextContent);
  writeText(files.s4Sep,       GOLD_RULE);
  writeText(files.s4Brand,     config.brandName);
  writeText(files.s4Url,       config.brandUrl);

  logger.debug("Scene text files written", { jobDir, theme: plan.theme.id, cta: plan.cta.id });

  return files;
}

// ---------------------------------------------------------------------------
// Asset availability helpers
// ---------------------------------------------------------------------------

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// FFmpeg argument builder
// ---------------------------------------------------------------------------

async function buildFFmpegArgs(
  plan: VideoPlan,
  textFiles: SceneTextFiles,
  fonts: ResolvedFonts,
  outputPath: string,
  config: AppConfig
): Promise<string[]> {

  // ── 1. Background PNG (generated once per theme, cached) ─────────────────
  const bgPath = await ensureBackground(plan.theme, config.tmpDir, config.ffmpegPath);

  // ── 2. Zodiac wheel ───────────────────────────────────────────────────────
  const hasWheel = fileExists(config.wheelPath);
  if (!hasWheel) {
    logger.warn(
      "assets/wheel/zodiac-wheel.png not found — rendering without wheel overlay. " +
      "Ensure the file is committed to the repository."
    );
  }

  // ── 3. Music ──────────────────────────────────────────────────────────────
  const musicPath = selectMusicTrack(config.musicDir, config.musicTrackPath);
  const hasMusic  = musicPath !== null && fileExists(musicPath);

  // ── 4. Build input list (order determines stream indices) ─────────────────
  const inputs: string[] = [];
  let nextIdx = 0;

  // Input 0: background PNG (looped as video source)
  inputs.push("-loop", "1", "-i", bgPath);
  const bgIdx = nextIdx++;

  // Input 1 (optional): zodiac wheel PNG
  let wheelIdx = -1;
  if (hasWheel) {
    inputs.push("-loop", "1", "-i", config.wheelPath);
    wheelIdx = nextIdx++;
  }

  // Input 2 or 1 (optional): music
  let musicIdx = -1;
  if (hasMusic) {
    inputs.push("-stream_loop", "-1", "-i", musicPath!);
    musicIdx = nextIdx++;
  }

  // ── 5. Build filter_complex ───────────────────────────────────────────────
  const videoFC = buildFilterComplex(plan, textFiles, fonts, bgIdx, wheelIdx);

  const audioFC = hasMusic
    ? buildRealMusicFilter(musicIdx, plan.totalDuration)
    : buildSyntheticAudioFilter(plan.totalDuration);

  const filterComplex = `${videoFC};\n${audioFC}`;

  // Log which assets are active
  logger.info("Render assets", {
    theme:     plan.theme.name,
    cta:       plan.cta.id,
    hasWheel,
    hasMusic,
    musicFile: hasMusic ? path.basename(musicPath!) : "synthetic",
    wheelDir:  wheelIdx >= 0 ? "clockwise" : "n/a",
  });

  // ── 6. Assemble full FFmpeg command ───────────────────────────────────────
  return [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-t", plan.totalDuration.toFixed(3),
    // Video — H.264, wide platform compatibility
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "veryfast",
    "-profile:v", "main",
    "-level", "4.0",
    // Audio — AAC 128 k
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar",  "44100",
    // Pixel format and streaming optimisation
    "-pix_fmt", "yuv420p",
    "-threads", "0",
    "-movflags", "+faststart",
    outputPath,
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Renders one video for the given plan.
 *
 * Returns the local MP4 path and timing information.
 * Throws on FFmpeg failure — the caller handles retries via withRetry().
 */
export async function renderVideo(
  plan: VideoPlan,
  fonts: ResolvedFonts,
  jobDir: string,
  outputPath: string,
  config: AppConfig
): Promise<RenderedVideo> {
  const textFiles = writeSceneTextFiles(jobDir, plan, config);
  const args      = await buildFFmpegArgs(plan, textFiles, fonts, outputPath, config);

  logger.info("Starting video render", {
    sign:          plan.sign,
    mood:          plan.mood,
    theme:         plan.theme.name,
    hookFontSize:  plan.hookFontSize,
    totalDuration: plan.totalDuration,
  });

  const { durationSeconds: renderTimeSeconds } = await runFFmpeg(args, config.ffmpegPath);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(
      `FFmpeg exited successfully but output is missing or empty: ${outputPath}`
    );
  }

  const fileSizeKB = Math.round(fs.statSync(outputPath).size / 1024);

  logger.info("Video render complete", {
    sign:              plan.sign,
    mood:              plan.mood,
    theme:             plan.theme.name,
    renderTimeSeconds: renderTimeSeconds.toFixed(1),
    fileSizeKB,
  });

  return {
    outputPath,
    durationSeconds: plan.totalDuration,
    renderTimeSeconds,
  };
}
