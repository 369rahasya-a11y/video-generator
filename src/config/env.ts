/**
 * env.ts — Configuration loader
 *
 * Loads all environment variables and validates required ones up-front.
 * Adds new paths for the zodiac wheel asset and music directory.
 * Backward-compatible with existing deployments.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config();

export class EnvValidationError extends Error {
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill these in.`
    );
    this.name = "EnvValidationError";
  }
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

export interface AppConfig {
  // ── Supabase ──────────────────────────────────────────────────────────────
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseVideoBucket: string;

  // ── FFmpeg ────────────────────────────────────────────────────────────────
  ffmpegPath: string;
  ffprobePath: string;

  // ── Assets ────────────────────────────────────────────────────────────────
  /** Path to zodiac wheel PNG overlay (assets/wheel/zodiac-wheel.png) */
  wheelPath: string;
  /** Directory that contains ambient .mp3/.ogg music tracks */
  musicDir: string;
  /**
   * Optional single-track override for backward compatibility.
   * If set and the file exists, this track is always used instead of
   * discovering files in musicDir.
   */
  musicTrackPath: string;

  // ── Brand ─────────────────────────────────────────────────────────────────
  brandName: string;
  brandUrl: string;

  // ── Batch ─────────────────────────────────────────────────────────────────
  defaultBatchLimit: number;

  // ── Directories ───────────────────────────────────────────────────────────
  // (see AppConfig fields above; narration/tts fields documented below)
  tmpDir: string;
  outputDir: string;

  piperPath: string;
  piperModelPath: string;
  piperConfigPath: string;
  piperLengthScale: number;

  targetDurationSeconds: number;
  targetDurationToleranceSeconds: number;
  basePauseSeconds: number;
  minPauseSeconds: number;
  maxPauseSeconds: number;
  minTempo: number;
  maxTempo: number;
  ctaMinDurationSeconds: number;
}

/**
 * Loads and validates all required environment variables.
 * Fails fast so a misconfigured environment is caught before batch starts.
 */
export function loadConfig(): AppConfig {
  const missing: string[] = [];

  const get = (name: string): string => {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      missing.push(name);
      return "";
    }
    return value;
  };

  const supabaseUrl = get("SUPABASE_URL");
  const supabaseServiceRoleKey = get("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }

  const tmpDir = path.resolve(optional("TMP_DIR", "tmp"));
  const outputDir = path.resolve(optional("OUTPUT_DIR", "output"));

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseVideoBucket: optional("SUPABASE_VIDEO_BUCKET", "social-videos"),

    ffmpegPath: optional("FFMPEG_PATH", "ffmpeg"),
    ffprobePath: optional("FFPROBE_PATH", "ffprobe"),

    wheelPath: path.resolve(
      optional("WHEEL_PATH", "assets/wheel/zodiac-wheel.png")
    ),
    musicDir: path.resolve(optional("MUSIC_DIR", "assets/music")),
    musicTrackPath: optional("MUSIC_TRACK_PATH", ""),

    brandName: optional("BRAND_NAME", "Discover Rahasya"),
    brandUrl: optional("BRAND_URL", "discover-rahasya.vercel.app"),

    defaultBatchLimit: parseInt(optional("DEFAULT_BATCH_LIMIT", "24"), 10),

    tmpDir,
    outputDir,

    piperPath: optional("PIPER_PATH", "piper"),
    piperModelPath: optional("PIPER_MODEL_PATH", path.resolve("assets/voice/voice.onnx")),
    piperConfigPath: optional("PIPER_CONFIG_PATH", ""),
    piperLengthScale: parseFloat(optional("PIPER_LENGTH_SCALE", "1.05")),

    targetDurationSeconds: parseFloat(optional("TARGET_DURATION_SECONDS", "30")),
    targetDurationToleranceSeconds: parseFloat(optional("TARGET_DURATION_TOLERANCE_SECONDS", "1")),
    basePauseSeconds: parseFloat(optional("BASE_PAUSE_SECONDS", "0.45")),
    minPauseSeconds: parseFloat(optional("MIN_PAUSE_SECONDS", "0.3")),
    maxPauseSeconds: parseFloat(optional("MAX_PAUSE_SECONDS", "0.6")),
    minTempo: parseFloat(optional("MIN_TEMPO", "0.85")),
    maxTempo: parseFloat(optional("MAX_TEMPO", "1.18")),
    ctaMinDurationSeconds: parseFloat(optional("CTA_MIN_DURATION_SECONDS", "3.5")),
  };
}
