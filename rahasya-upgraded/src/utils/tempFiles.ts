import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { logger } from "./logger";

/**
 * Creates a fresh scratch directory under `baseTmpDir` for one video job.
 * Caller is responsible for calling cleanupDir() when done (including on
 * error paths) so we never leak partial renders.
 */
export function createJobDir(baseTmpDir: string): string {
  const jobId = crypto.randomUUID();
  const dir = path.join(baseTmpDir, jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn("Failed to clean up temp directory", {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Slugifies "sign" + "mood" into the filename pattern used in storage. */
export function buildVideoFilename(sign: string, mood: string): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  return `${slug(sign)}-${slug(mood)}.mp4`;
}
