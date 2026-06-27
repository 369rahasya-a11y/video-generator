/**
 * backgroundEngine.ts
 *
 * Generates a premium dark radial-gradient background PNG for each theme
 * using FFmpeg's vignette filter. The PNG is generated once per theme per
 * Node.js process and cached in-memory + on disk under tmp/bg_cache/.
 *
 * Re-using a static PNG as the video source is far more efficient than
 * computing a gradient per-pixel per-frame inside the main filtergraph.
 *
 * The generated PNG has:
 *   • A rich centre colour specific to each theme
 *   • A smooth dark vignette that fades to near-black at the edges
 *   • Dimensions exactly matching the video canvas (1080 × 1920)
 */

import * as fs from "fs";
import * as path from "path";
import { VideoTheme } from "../config/themes";
import { runFFmpeg } from "../utils/ffmpegRunner";
import { logger } from "../utils/logger";

// Module-level cache: themeId → absolute path of the generated PNG
const bgCache = new Map<string, string>();

/**
 * Returns the path to a ready-to-use background PNG for the given theme.
 * Generates and caches it on first call; returns the cached path thereafter.
 *
 * @param theme      The selected video theme
 * @param tmpDir     Root tmp directory (e.g. "tmp")
 * @param ffmpegPath Path / name of the ffmpeg binary
 */
export async function ensureBackground(
  theme: VideoTheme,
  tmpDir: string,
  ffmpegPath: string
): Promise<string> {
  // In-memory cache hit — fastest path
  if (bgCache.has(theme.id)) {
    return bgCache.get(theme.id)!;
  }

  const cacheDir = path.resolve(tmpDir, "bg_cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  const pngPath = path.join(cacheDir, `${theme.id}.png`);

  // Disk cache hit — process restarted but file already exists
  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
    bgCache.set(theme.id, pngPath);
    logger.info(`Background cache hit (disk): ${theme.id}`);
    return pngPath;
  }

  logger.info(`Generating background for theme: ${theme.name}`);

  await generateBackgroundPng(theme, pngPath, ffmpegPath);

  bgCache.set(theme.id, pngPath);
  logger.info(`Background generated and cached: ${theme.id} → ${pngPath}`);

  return pngPath;
}

/**
 * Generates a single-frame 1080×1920 PNG using FFmpeg.
 *
 * Pipeline:
 *   lavfi color source (theme centre colour)
 *     → vignette (darkens edges toward near-black)
 *     → rgb24 PNG
 */
async function generateBackgroundPng(
  theme: VideoTheme,
  outputPath: string,
  ffmpegPath: string
): Promise<void> {
  // Sanitise the hex colour: remove # and ensure 6 chars
  const hex = theme.bgCenter.replace("#", "");

  const args = [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${hex}:s=1080x1920:r=1`,
    "-vframes", "1",
    "-vf", [
      // Vignette: darkens edges toward near-black, creating premium depth.
      // FFmpeg vignette supports: angle, x0, y0, mode, eval, dither, aspect
      `vignette=angle=${theme.vignetteAngle}:eval=init`,
      // Second pass: additional darkening of extreme edges via eq filter
      "eq=brightness=-0.05:contrast=1.05",
      "format=rgb24",
    ].join(","),
    "-pix_fmt", "rgb24",
    "-f", "image2",
    outputPath,
  ];

  await runFFmpeg(args, ffmpegPath);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(
      `Background PNG generation failed for theme "${theme.id}": output is missing or empty.`
    );
  }
}
