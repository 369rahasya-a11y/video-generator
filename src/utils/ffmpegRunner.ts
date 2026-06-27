import { spawn } from "child_process";
import { logger } from "./logger";

export interface FFmpegResult {
  durationSeconds: number; // wall-clock time the process took
}

/**
 * Executes FFmpeg with the given argument array. Streams stderr (where FFmpeg
 * writes progress) so long-running encodes don't silently time out in CI.
 *
 * Rejects with a descriptive error if FFmpeg exits non-zero, including the
 * last 2 KB of stderr so the CI log shows what went wrong.
 */
export function runFFmpeg(
  args: string[],
  ffmpegPath = "ffmpeg"
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    logger.info("Spawning FFmpeg", {
      bin: ffmpegPath,
      // Log first + last few args to avoid flooding the log with the
      // full 3 KB filtergraph string.
      argsHead: args.slice(0, 8),
      argsTail: args.slice(-4),
      argCount: args.length,
    });

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      // FFmpeg rarely writes to stdout, but capture it anyway.
      logger.debug("ffmpeg stdout", { data: chunk.toString() });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // Tail the buffer to ~16 KB — enough for error messages.
      if (stderr.length > 16384) {
        stderr = stderr.slice(stderr.length - 16384);
      }
      // Surface the progress line (contains fps/time/bitrate) at debug level
      // so `DEBUG=1 npm run preview` shows live progress.
      const progressMatch = text.match(/time=\S+/);
      if (progressMatch) {
        logger.debug("FFmpeg progress", { line: progressMatch[0] });
      }
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start FFmpeg ("${ffmpegPath}"): ${err.message}. ` +
            `Is ffmpeg installed? On Ubuntu: apt-get install ffmpeg`
        )
      );
    });

    child.on("close", (code) => {
      const durationSeconds = (Date.now() - started) / 1000;

      if (code === 0) {
        logger.info("FFmpeg finished", {
          durationSeconds: durationSeconds.toFixed(1),
        });
        resolve({ durationSeconds });
        return;
      }

      // Extract the most useful part of the error output.
      const tail = stderr.slice(-2000).trim();
      reject(
        new Error(
          `FFmpeg exited with code ${code} (after ${durationSeconds.toFixed(1)}s).\n` +
            `--- FFmpeg stderr (last 2KB) ---\n${tail}`
        )
      );
    });
  });
}
