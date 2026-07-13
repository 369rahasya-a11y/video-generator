/**
 * commandCheck.ts
 *
 * Verifies an external binary actually exists and is runnable, by spawning
 * it with a lightweight flag and checking we don't get ENOENT / a spawn
 * error. Used by preflight.ts so missing dependencies (Piper, FFmpeg,
 * FFprobe) are caught with a clear message before any generation work
 * starts, instead of surfacing as a cryptic `spawn X ENOENT` mid-batch.
 */

import { spawn } from "child_process";

export interface CommandCheckResult {
  ok: boolean;
  error?: string;
}

/**
 * Attempts to spawn `command` with `args` and resolves once the process
 * starts (or fails to start). Does not wait for the process to exit unless
 * `waitForExit` is true -- some binaries (e.g. --help) exit immediately,
 * others may hang, so the default just confirms the executable was found
 * and launched successfully.
 */
export function checkCommand(
  command: string,
  args: string[] = ["--help"],
  timeoutMs = 8000
): Promise<CommandCheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "ignore"] });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // ignore
      }
      // The process started (no ENOENT) but didn't exit in time -- that's
      // fine, it means the binary exists and is runnable.
      resolve({ ok: true });
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on("exit", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: true });
    });
  });
}
