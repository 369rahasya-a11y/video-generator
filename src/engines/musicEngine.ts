/**
 * musicEngine.ts
 *
 * Manages ambient music for video generation.
 *
 * Responsibilities:
 *   1. Discover all audio files under assets/music/
 *   2. Randomly select one per video, avoiding immediate repeats
 *   3. Build the FFmpeg audio filter (fade-in, fade-out, volume normalise)
 *   4. Fall back to the synthesised cosmic drone if no tracks are found
 *
 * Rendering NEVER fails because of missing music — the fallback is always
 * a valid FFmpeg audio filter that generates audio synthetically.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

// Supported audio formats
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aac"]);

// Module-level state: tracks the last used file within one batch session
// so we avoid playing the same track twice in a row.
let lastUsedTrack: string | null = null;

// ---------------------------------------------------------------------------
// Track discovery
// ---------------------------------------------------------------------------

function discoverTracks(musicDir: string): string[] {
  try {
    if (!fs.existsSync(musicDir)) return [];
    return fs
      .readdirSync(musicDir)
      .filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map((f) => path.resolve(musicDir, f))
      .filter((p) => {
        try { return fs.statSync(p).size > 0; } catch { return false; }
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the path to the music track to use for this video, or null if
 * no tracks are available. Falls back to null rather than throwing.
 *
 * Priority:
 *   1. A specific musicTrackPath set in config (backward-compat override)
 *   2. A random track from the musicDir folder
 *   3. null → caller will use the synthetic fallback
 */
export function selectMusicTrack(
  musicDir: string,
  overridePath: string
): string | null {
  // Legacy single-track override (backward compatible with old MUSIC_TRACK_PATH)
  if (overridePath) {
    try {
      if (fs.existsSync(overridePath) && fs.statSync(overridePath).size > 0) {
        logger.info("Using music track override", { path: overridePath });
        return overridePath;
      }
    } catch { /* ignore */ }
  }

  const tracks = discoverTracks(musicDir);
  if (tracks.length === 0) {
    logger.warn("No music tracks found — will use synthesised audio", { musicDir });
    return null;
  }

  // Avoid repeating the last used track when there are alternatives
  const candidates =
    tracks.length > 1 && lastUsedTrack
      ? tracks.filter((t) => t !== lastUsedTrack)
      : tracks;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  lastUsedTrack = selected;

  logger.info("Music track selected", {
    file: path.basename(selected),
    totalTracks: tracks.length,
  });

  return selected;
}

// ---------------------------------------------------------------------------
// FFmpeg audio filter builders
// ---------------------------------------------------------------------------

/**
 * Real-music + narration filter: music ducked under narration, both mixed
 * to a single output. Narration input label is `[NARR_IDX:a]`, music input
 * label is `[MUSIC_IDX:a]`.
 */
export function buildRealMusicFilter(
  musicInputIndex: number,
  totalDuration: number
): string {
  const fadeOutStart = Math.max(0, totalDuration - 1.5).toFixed(3);
  return (
    `[${musicInputIndex}:a]` +
    `afade=t=in:d=1.5,` +
    `afade=t=out:st=${fadeOutStart}:d=1.5,` +
    `volume=0.65` +
    `[aout]`
  );
}

/**
 * Mixes narration (full volume, foreground) with ambient music (ducked,
 * background) into a single [aout] stream. Both inputs are padded/trimmed
 * to `totalDuration` by the caller's -t flag, so no explicit trim is needed
 * here.
 */
export function buildNarrationWithMusicFilter(
  narrationIndex: number,
  musicInputIndex: number,
  totalDuration: number
): string {
  const fadeOutStart = Math.max(0, totalDuration - 1.5).toFixed(3);
  return (
    `[${musicInputIndex}:a]` +
    `afade=t=in:d=1.5,` +
    `afade=t=out:st=${fadeOutStart}:d=1.5,` +
    `volume=0.22` +
    `[music_a];` +
    `[${narrationIndex}:a]` +
    `volume=1.0` +
    `[narr_a];` +
    `[narr_a][music_a]amix=inputs=2:duration=first:dropout_transition=2,` +
    `volume=1.6` +
    `[aout]`
  );
}

/**
 * Narration-only fallback (no music track available). Narration is the
 * sole audio output.
 */
export function buildNarrationOnlyFilter(narrationIndex: number): string {
  return `[${narrationIndex}:a]volume=1.0[aout]`;
}

// ---------------------------------------------------------------------------
// Cosmic ambient drone (synthesised fallback)
//
// Multi-harmonic drone tuned to 136.1 Hz — the "Earth year" / OM frequency.
// Layers slow amplitude-modulated harmonics for a living, breathing pad.
//
// Frequencies:
//    68.05 Hz  — sub-octave root (felt, barely heard)
//   136.1  Hz  — fundamental (OM / Earth frequency)
//   204.15 Hz  — natural perfect fifth
//   272.2  Hz  — octave above fundamental
//   408.3  Hz  — upper harmonic shimmer
// ---------------------------------------------------------------------------

const COSMIC_EXPR =
  `0.18*sin(6.28318*68.05*t)*(0.75+0.25*sin(6.28318*0.04*t))` +
  `+0.22*sin(6.28318*136.1*t)` +
  `+0.10*sin(6.28318*204.15*t)*(0.8+0.2*sin(6.28318*0.07*t))` +
  `+0.14*sin(6.28318*272.2*t)*sin(6.28318*0.09*t)` +
  `+0.06*sin(6.28318*408.3*t)*(0.5+0.5*sin(6.28318*0.13*t))`;

/**
 * Synthesised cosmic audio filter — no external file needed.
 * Generates a 44.1 kHz stereo tone entirely within FFmpeg.
 */
export function buildSyntheticAudioFilter(totalDuration: number): string {
  const fadeOutStart = Math.max(0, totalDuration - 1.5).toFixed(3);
  return (
    `aevalsrc='${COSMIC_EXPR}':s=44100:c=stereo` +
    `[raw_tone];` +
    `[raw_tone]` +
    `aecho=0.8:0.8:400:0.45,` +
    `afade=t=in:d=2,` +
    `afade=t=out:st=${fadeOutStart}:d=1.5,` +
    `volume=0.45` +
    `[aout]`
  );
}
