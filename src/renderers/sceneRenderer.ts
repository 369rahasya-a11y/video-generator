/**
 * sceneRenderer.ts -- Video Render Orchestrator
 *
 * Coordinates one complete video render:
 *   1. Ensure the theme background PNG exists (generated once per theme per session)
 *   2. Write all per-scene content text files to the job temp directory
 *   3. Discover music track (or use synthetic fallback), mix under narration
 *   4. Build the complete FFmpeg argument list (video + narration + music)
 *   5. Execute FFmpeg and verify output
 *
 * This module is fully decoupled from Supabase -- it only produces a local
 * MP4. The caller (videoGenerator.ts) handles upload and database
 * persistence. Narration audio itself is produced upstream by
 * narrationBuilder.ts (invoked from scenePlanner.ts) -- this module only
 * consumes plan.narrationPath as an input file.
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
import {
  selectMusicTrack,
  buildNarrationWithMusicFilter,
  buildNarrationOnlyFilter,
} from "../engines/musicEngine";

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
 * Single word  -> capitalised ("peaceful" -> "Peaceful")
 * Multiple (comma/semicolon separated) -> "Word . Word . Word"
 */
function formatMoodDisplay(mood: string): string {
  return mood
    .trim()
    .split(/[,;/]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" \u00B7 ");
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

  const sceneText: string[] = plan.scenes.map((scene, i) => {
    const p = path.join(jobDir, `scene_${i}_${scene.name}.txt`);
    writeText(p, scene.text);
    return p;
  });

  const files: SceneTextFiles = {
    brand1: path.join(jobDir, "brand1.txt"),
    brand2: path.join(jobDir, "brand2.txt"),
    hookSymbol: path.join(jobDir, "hook_symbol.txt"),
    hookSign: path.join(jobDir, "hook_sign.txt"),
    hookMood: path.join(jobDir, "hook_mood.txt"),
    sceneText,
    ctaSymbol: path.join(jobDir, "cta_symbol.txt"),
    ctaSep: path.join(jobDir, "cta_sep.txt"),
    ctaBrand: path.join(jobDir, "cta_brand.txt"),
    ctaUrl: path.join(jobDir, "cta_url.txt"),
  };

  writeText(files.brand1, "DISCOVER");
  writeText(files.brand2, "RAHASYA");
  writeText(files.hookSymbol, symbol);
  writeText(files.hookSign, display.toUpperCase());
  writeText(files.hookMood, moodDisplay);
  writeText(files.ctaSymbol, plan.ctaSymbol);
  writeText(files.ctaSep, GOLD_RULE);
  writeText(files.ctaBrand, config.brandName);
  writeText(files.ctaUrl, config.brandUrl);

  logger.debug("Scene text files written", { jobDir, theme: plan.theme.id, scenes: plan.scenes.map((s) => s.name) });

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

  // 1. Background PNG (generated once per theme, cached)
  const bgPath = await ensureBackground(plan.theme, config.tmpDir, config.ffmpegPath);

  // 2. Zodiac wheel
  const hasWheel = fileExists(config.wheelPath);
  if (!hasWheel) {
    logger.warn(
      "assets/wheel/zodiac-wheel.png not found -- rendering without wheel overlay. " +
      "Ensure the file is committed to the repository."
    );
  }

  // 3. Music (background, ducked under narration)
  const musicPath = selectMusicTrack(config.musicDir, config.musicTrackPath);
  const hasMusic = musicPath !== null && fileExists(musicPath);

  // 4. Narration (required -- generated upstream by narrationBuilder)
  if (!fileExists(plan.narrationPath)) {
    throw new Error(`Narration audio missing at ${plan.narrationPath}`);
  }

  // 5. Build input list (order determines stream indices)
  const inputs: string[] = [];
  let nextIdx = 0;

  // Input 0: background PNG (looped as video source)
  inputs.push("-loop", "1", "-i", bgPath);
  const bgIdx = nextIdx++;

  // Input (optional): zodiac wheel PNG
  let wheelIdx = -1;
  if (hasWheel) {
    inputs.push("-loop", "1", "-i", config.wheelPath);
    wheelIdx = nextIdx++;
  }

  // Input: narration track (always present)
  inputs.push("-i", plan.narrationPath);
  const narrationIdx = nextIdx++;

  // Input (optional): music, looped to cover the full duration
  let musicIdx = -1;
  if (hasMusic) {
    inputs.push("-stream_loop", "-1", "-i", musicPath!);
    musicIdx = nextIdx++;
  }

  // 6. Build filter_complex
  const videoFC = buildFilterComplex(plan, textFiles, fonts, bgIdx, wheelIdx);

  const audioFC = hasMusic
    ? buildNarrationWithMusicFilter(narrationIdx, musicIdx, plan.totalDuration)
    : buildNarrationOnlyFilter(narrationIdx);

  const filterComplex = `${videoFC};\n${audioFC}`;

  logger.info("Render assets", {
    theme: plan.theme.name,
    hasWheel,
    hasMusic,
    musicFile: hasMusic ? path.basename(musicPath!) : "none",
    scenes: plan.scenes.map((s) => s.name),
    totalDuration: plan.totalDuration.toFixed(2),
  });

  // 7. Assemble full FFmpeg command
  return [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-t", plan.totalDuration.toFixed(3),
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "veryfast",
    "-profile:v", "main",
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
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
 * Throws on FFmpeg failure -- the caller handles retries via withRetry().
 */
export async function renderVideo(
  plan: VideoPlan,
  fonts: ResolvedFonts,
  jobDir: string,
  outputPath: string,
  config: AppConfig
): Promise<RenderedVideo> {
  const textFiles = writeSceneTextFiles(jobDir, plan, config);
  const args = await buildFFmpegArgs(plan, textFiles, fonts, outputPath, config);

  logger.info("Starting video render", {
    sign: plan.sign,
    mood: plan.mood,
    theme: plan.theme.name,
    totalDuration: plan.totalDuration.toFixed(2),
  });

  const { durationSeconds: renderTimeSeconds } = await runFFmpeg(args, config.ffmpegPath);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(
      `FFmpeg exited successfully but output is missing or empty: ${outputPath}`
    );
  }

  const fileSizeKB = Math.round(fs.statSync(outputPath).size / 1024);

  logger.info("Video render complete", {
    sign: plan.sign,
    mood: plan.mood,
    theme: plan.theme.name,
    renderTimeSeconds: renderTimeSeconds.toFixed(1),
    fileSizeKB,
  });

  return {
    outputPath,
    durationSeconds: plan.totalDuration,
    renderTimeSeconds,
  };
}
