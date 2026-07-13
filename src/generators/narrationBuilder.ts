/**
 * narrationBuilder.ts
 *
 * Builds the complete narration track for one video from the six
 * video_story_* fields, and derives scene timing directly from measured
 * narration durations ("scene timing should always follow narration timing").
 *
 * Pipeline:
 *   1. Synthesize each of the 6 sections independently via the TTSProvider
 *      (Piper). One section = one scene = one narration clip.
 *   2. Measure each clip's duration.
 *   3. Compute a single tempo multiplier + pause length so the assembled
 *      total lands on config.targetDurationSeconds (+/- tolerance), without
 *      ever shortening or dropping any story content — only natural
 *      speed/pause adjustment within configured limits.
 *   4. Concatenate the (tempo-adjusted) clips with silence gaps into one
 *      narration WAV, padded to the final total video duration.
 *
 * This module never rewrites, summarizes, or regenerates the story text —
 * it only speaks it and times it.
 */

import * as path from "path";
import { AppConfig } from "../config/env";
import { TTSProvider } from "../tts/ttsProvider";
import { runFFmpeg } from "../utils/ffmpegRunner";
import { logger } from "../utils/logger";

export type StorySceneName =
  | "hook"
  | "relatable_moment"
  | "emotional_realization"
  | "horoscope_connection"
  | "open_ending"
  | "cta";

export interface NarrationSection {
  name: StorySceneName;
  text: string;
}

export interface NarrationScene {
  name: StorySceneName;
  text: string;
  start: number;
  duration: number;
}

export interface NarrationResult {
  /** Absolute path to the final, assembled narration WAV (padded to totalDuration). */
  narrationPath: string;
  scenes: NarrationScene[];
  totalDuration: number;
  tempo: number;
  pauseSeconds: number;
}

/**
 * Builds narration audio + scene timing for one video.
 *
 * @param sections  The 6 story sections, in narration order.
 * @param jobDir    Scratch directory for this video's temp files.
 */
export async function buildNarration(
  sections: NarrationSection[],
  jobDir: string,
  config: AppConfig,
  tts: TTSProvider
): Promise<NarrationResult> {
  if (sections.length < 2) {
    throw new Error("buildNarration requires at least 2 story sections");
  }

  // ── 1. Synthesize each section independently ──────────────────────────────
  const rawPaths: string[] = [];
  const rawDurations: number[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const outPath = path.join(jobDir, `narr_raw_${i}_${section.name}.wav`);
    logger.debug("Synthesizing narration section", { name: section.name, provider: tts.name });

    const result = await tts.synthesize(section.text, outPath);
    rawPaths.push(result.outputPath);
    rawDurations.push(result.durationSeconds);
  }

  // ── 2. Compute pacing to hit the target runtime ────────────────────────────
  const pauseCount = sections.length - 1;
  const narrationOnlyTotal = rawDurations.reduce((a, b) => a + b, 0);
  const baseTotal = narrationOnlyTotal + pauseCount * config.basePauseSeconds;

  const ratio = config.targetDurationSeconds / baseTotal;
  // tempo > 1 speeds narration up (shortens); tempo < 1 slows it down (lengthens).
  const tempo = clamp(1 / ratio, config.minTempo, config.maxTempo);
  const pauseSeconds = clamp(config.basePauseSeconds * ratio, config.minPauseSeconds, config.maxPauseSeconds);

  const scaledDurations = rawDurations.map((d) => d / tempo);

  // ── 3. Lay out scenes back-to-back; enforce a minimum CTA hold time ────────
  const scenes: NarrationScene[] = [];
  let cursor = 0;
  for (let i = 0; i < sections.length; i++) {
    const isLast = i === sections.length - 1;
    let duration = scaledDurations[i];
    if (isLast) {
      // Never rush the ending — hold the CTA fully visible even if its
      // narration is short. This only extends the visual scene; it does not
      // add filler narration.
      duration = Math.max(duration, config.ctaMinDurationSeconds);
    } else {
      duration += pauseSeconds;
    }
    scenes.push({ name: sections[i].name, text: sections[i].text, start: cursor, duration });
    cursor += duration;
  }

  const totalDuration = cursor;
  const deviation = Math.abs(totalDuration - config.targetDurationSeconds);
  if (deviation > config.targetDurationToleranceSeconds) {
    logger.warn(
      "Narration total duration outside target tolerance after natural pacing limits — " +
      "preserving full story content rather than cutting it.",
      {
        totalDuration: totalDuration.toFixed(2),
        target: config.targetDurationSeconds,
        tolerance: config.targetDurationToleranceSeconds,
        tempo: tempo.toFixed(3),
        pauseSeconds: pauseSeconds.toFixed(3),
      }
    );
  }

  // ── 4. Assemble the final narration WAV ─────────────────────────────────────
  const narrationPath = path.join(jobDir, "narration_final.wav");
  await assembleNarrationTrack(rawPaths, tempo, pauseSeconds, totalDuration, narrationPath, config);

  logger.info("Narration built", {
    sections: scenes.map((s) => ({ name: s.name, start: s.start.toFixed(2), duration: s.duration.toFixed(2) })),
    totalDuration: totalDuration.toFixed(2),
    tempo: tempo.toFixed(3),
    pauseSeconds: pauseSeconds.toFixed(3),
  });

  return { narrationPath, scenes, totalDuration, tempo, pauseSeconds };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Builds one FFmpeg filter_complex that: applies the shared tempo multiplier
 * to every narration clip, inserts silence gaps of `pauseSeconds` between
 * them, concatenates everything into a single track, and pads the result to
 * exactly `totalDuration` so the audio never falls short of the video length
 * (e.g. when the CTA hold time exceeds its narration).
 */
async function assembleNarrationTrack(
  rawPaths: string[],
  tempo: number,
  pauseSeconds: number,
  totalDuration: number,
  outputPath: string,
  config: AppConfig
): Promise<void> {
  const n = rawPaths.length;
  const pauseCount = n - 1;
  const filterParts: string[] = [];

  for (let i = 0; i < n; i++) {
    filterParts.push(
      `[${i}:a]atempo=${tempo.toFixed(4)},aformat=sample_rates=44100:channel_layouts=mono[a${i}]`
    );
  }
  for (let i = 0; i < pauseCount; i++) {
    filterParts.push(`aevalsrc=0:s=44100:d=${pauseSeconds.toFixed(4)}[sil${i}]`);
  }

  const concatInputs: string[] = [];
  for (let i = 0; i < n; i++) {
    concatInputs.push(`[a${i}]`);
    if (i < pauseCount) concatInputs.push(`[sil${i}]`);
  }
  const concatCount = n + pauseCount;
  filterParts.push(`${concatInputs.join("")}concat=n=${concatCount}:v=0:a=1[c]`);
  filterParts.push(`[c]apad=whole_dur=${totalDuration.toFixed(4)}[narrfinal]`);

  const filterComplex = filterParts.join(";\n");

  const args: string[] = ["-y"];
  for (const p of rawPaths) {
    args.push("-i", p);
  }
  args.push(
    "-filter_complex", filterComplex,
    "-map", "[narrfinal]",
    "-ar", "44100",
    "-ac", "1",
    outputPath
  );

  await runFFmpeg(args, config.ffmpegPath);
}
