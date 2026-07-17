/**
 * backgroundEngine.ts
 *
 * Resolves the background image to use for one video.
 *
 * PRIMARY PATH (production asset pack present):
 *   Returns a real production background image from assets/backgrounds/,
 *   chosen via assetManager's fixed deterministic sequential rotation keyed
 *   on the video's stable row id (plan.videoNumber). Never randomised.
 *
 * FALLBACK PATH (asset pack missing/empty -- non-fatal):
 *   Preserves the original behaviour exactly: a premium dark radial-gradient
 *   PNG generated per-theme via FFmpeg's vignette filter, cached in-memory +
 *   on disk under tmp/bg_cache/. This guarantees rendering never crashes
 *   because of a missing asset pack.
 */

import * as fs from "fs";
import * as path from "path";
import { VideoTheme } from "../config/themes";
import { runFFmpeg } from "../utils/ffmpegRunner";
import { logger } from "../utils/logger";
import { getBackgroundForVideoNumber } from "../assets/assetManager";

// Module-level cache: themeId → absolute path of the generated PNG (fallback only)
const bgCache = new Map<string, string>();

/**
 * Returns the path to a ready-to-use background image for this video.
 *
 * @param videoNumber    Deterministic 1-based video number (plan.videoNumber)
 *                       used to key fixed sequential background rotation.
 * @param backgroundsDir Directory containing the production background pack.
 * @param theme          The selected video theme (used only by the
 *                       procedural-gradient fallback, and for accent
 *                       colour / wheel opacity elsewhere -- unrelated to
 *                       background image selection now).
 * @param tmpDir         Root tmp directory (e.g. "tmp"), used by the fallback.
 * @param ffmpegPath     Path / name of the ffmpeg binary, used by the fallback.
 */
export async function ensureBackground(
  videoNumber: number,
  backgroundsDir: string,
  theme: VideoTheme,
  tmpDir: string,
  ffmpegPath: string
): Promise<string> {
  // Primary path: deterministic sequential rotation over real production assets.
  const assetPath = getBackgroundForVideoNumber(videoNumber, backgroundsDir);
  if (assetPath) {
    logger.info(`Background resolved via sequential rotation`, {
      videoNumber,
      background: path.basename(assetPath),
    });
    return assetPath;
  }

  // Fallback path: asset pack missing/empty -- never crash, use the
  // pre-existing procedural gradient generator exactly as before.
  logger.warn(
    `No background assets available in "${backgroundsDir}" -- ` +
    `falling back to procedural gradient background for theme "${theme.id}".`
  );
  return ensureProceduralBackground(theme, tmpDir, ffmpegPath);
}

// ---------------------------------------------------------------------------
// Legacy procedural generator -- preserved as the fallback only
// ---------------------------------------------------------------------------

async function ensureProceduralBackground(
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
