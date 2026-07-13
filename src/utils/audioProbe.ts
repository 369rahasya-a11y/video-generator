/**
 * audioProbe.ts
 *
 * Measures the duration of an audio file using ffprobe. Used by
 * narrationBuilder to discover how long each Piper-generated narration
 * segment actually is, so scene timing can follow narration timing.
 */

import { spawn } from "child_process";
import { logger } from "./logger";

/**
 * Returns the duration of `filePath` in seconds using ffprobe.
 * Throws if ffprobe fails or the duration cannot be parsed.
 */
export function probeDurationSeconds(
  filePath: string,
  ffprobePath = "ffprobe"
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];

    const child = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      reject(new Error(`Failed to start ffprobe ("${ffprobePath}"): ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code} for ${filePath}: ${stderr.trim()}`));
        return;
      }
      const duration = parseFloat(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error(`ffprobe returned an invalid duration for ${filePath}: "${stdout.trim()}"`));
        return;
      }
      logger.debug("Probed audio duration", { filePath, duration });
      resolve(duration);
    });
  });
}
