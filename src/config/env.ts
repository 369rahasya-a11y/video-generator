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
  tmpDir: string;
  outputDir: string;
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

    defaultBatchLimit: parseInt(optional("DEFAULT_BATCH_LIMIT", "20"), 10),

    tmpDir,
    outputDir,
  };
}
