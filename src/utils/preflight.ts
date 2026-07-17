/**
 * preflight.ts
 *
 * Verifies every external dependency the pipeline needs BEFORE any
 * marketing_content row is touched: FFmpeg, FFprobe, Piper (binary + voice
 * model + config), and fonts. This turns a mid-batch `spawn piper ENOENT`
 * (which wastes a partial run and leaves a confusing trail) into a single,
 * clear, fail-fast error at the very start of the job -- exactly what a
 * zero-manual-intervention GitHub Actions run needs.
 *
 * This module is purely diagnostic: it does not install or download
 * anything. Installation is handled by scripts/setup-piper.sh, invoked as
 * an explicit CI step before `npm run generate`.
 */

import * as fs from "fs";
import { AppConfig } from "../config/env";
import { checkCommand } from "./commandCheck";
import { resolveFonts } from "./fontResolver";
import { validateAssets } from "../assets/assetManager";
import { logger } from "./logger";

export class PreflightError extends Error {
  constructor(problems: string[]) {
    super(
      `Preflight check failed -- ${problems.length} problem(s) found. ` +
      `Fix these before generation can run:\n` +
      problems.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
    );
    this.name = "PreflightError";
  }
}

function fileNonEmpty(path: string): boolean {
  try {
    return fs.existsSync(path) && fs.statSync(path).size > 0;
  } catch {
    return false;
  }
}

/**
 * Runs all dependency checks. Throws PreflightError with an aggregated,
 * human-readable list of every problem found (not just the first one) so a
 * CI run can be fixed in one pass instead of trickling failures.
 */
export async function runPreflightChecks(config: AppConfig): Promise<void> {
  const problems: string[] = [];

  logger.info("Running preflight checks…");

  // ── FFmpeg / FFprobe ─────────────────────────────────────────────────────
  const ffmpegCheck = await checkCommand(config.ffmpegPath, ["-version"]);
  if (!ffmpegCheck.ok) {
    problems.push(
      `FFmpeg not found or not runnable at "${config.ffmpegPath}" (${ffmpegCheck.error}). ` +
      `Install with: apt-get install -y ffmpeg, or set FFMPEG_PATH.`
    );
  }

  const ffprobeCheck = await checkCommand(config.ffprobePath, ["-version"]);
  if (!ffprobeCheck.ok) {
    problems.push(
      `FFprobe not found or not runnable at "${config.ffprobePath}" (${ffprobeCheck.error}). ` +
      `It ships with the ffmpeg package. Set FFPROBE_PATH if it's elsewhere.`
    );
  }

  // ── Piper binary ─────────────────────────────────────────────────────────
  const piperCheck = await checkCommand(config.piperPath, ["--help"]);
  if (!piperCheck.ok) {
    problems.push(
      `Piper TTS binary not found or not runnable at "${config.piperPath}" (${piperCheck.error}). ` +
      `Run scripts/setup-piper.sh to install it automatically, or set PIPER_PATH ` +
      `to point at an existing installation.`
    );
  }

  // ── Piper voice model ────────────────────────────────────────────────────
  if (!fileNonEmpty(config.piperModelPath)) {
    problems.push(
      `Piper voice model not found (or empty) at "${config.piperModelPath}". ` +
      `Run scripts/setup-piper.sh to download it automatically, or set PIPER_MODEL_PATH.`
    );
  }

  // ── Piper voice config ───────────────────────────────────────────────────
  // If PIPER_CONFIG_PATH is explicitly set, that exact file must exist.
  // Otherwise Piper resolves it as "<model path>.json" by default -- verify
  // that sibling file exists so we don't discover this mid-batch.
  const configPath = config.piperConfigPath || `${config.piperModelPath}.json`;
  if (!fileNonEmpty(configPath)) {
    problems.push(
      `Piper voice config not found (or empty) at "${configPath}". ` +
      `Every Piper voice ships as a pair: the .onnx model and a .onnx.json ` +
      `config. Run scripts/setup-piper.sh to download both, or set PIPER_CONFIG_PATH.`
    );
  }

  // ── Fonts ────────────────────────────────────────────────────────────────
  try {
    resolveFonts();
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }

  // ── Zodiac wheel / music (non-fatal -- pipeline has graceful fallbacks) ──
  if (!fileNonEmpty(config.wheelPath)) {
    logger.warn(
      `Zodiac wheel asset not found at "${config.wheelPath}" -- videos will ` +
      `render without the wheel overlay. This is non-fatal.`
    );
  }

  // ── Production backgrounds / zodiac artwork (non-fatal -- graceful fallbacks) ──
  validateAssets(config.backgroundsDir, config.zodiacDir);

  if (problems.length > 0) {
    throw new PreflightError(problems);
  }

  logger.info("Preflight checks passed", {
    ffmpeg: config.ffmpegPath,
    ffprobe: config.ffprobePath,
    piper: config.piperPath,
    piperModel: config.piperModelPath,
    piperConfig: configPath,
  });
}
