/**
 * piperProvider.ts
 *
 * Offline, free, API-key-free narration using Piper TTS
 * (https://github.com/rhasspy/piper).
 *
 * Piper ships as a small self-contained executable (Linux/macOS/Windows) plus
 * a voice model (.onnx) and its config (.onnx.json). It has no network
 * dependency at runtime and is fast enough for batch generation of ~24
 * videos/day on ordinary CI hardware.
 *
 * CLI contract (per Piper's documented usage):
 *   echo "text to speak" | piper --model voice.onnx --output_file out.wav [--length_scale 1.0]
 *
 * This module only shells out to that CLI — it never talks to any network
 * service, and never imports ElevenLabs/OpenAI/Google/Azure/Polly SDKs.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AppConfig } from "../config/env";
import { TTSProvider, TTSSynthesizeOptions, TTSSynthesizeResult } from "./ttsProvider";
import { probeDurationSeconds } from "../utils/audioProbe";
import { logger } from "../utils/logger";

export class PiperProvider implements TTSProvider {
  readonly name = "piper";

  constructor(private readonly config: AppConfig) {}

  async synthesize(
    text: string,
    outputPath: string,
    options: TTSSynthesizeOptions = {}
  ): Promise<TTSSynthesizeResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("PiperProvider.synthesize called with empty text");
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const lengthScale = options.lengthScale ?? this.config.piperLengthScale;

    const args = ["--model", this.config.piperModelPath];
    if (this.config.piperConfigPath) {
      args.push("--config", this.config.piperConfigPath);
    }
    args.push("--length_scale", lengthScale.toFixed(3));
    args.push("--output_file", outputPath);

    await runPiper(this.config.piperPath, args, trimmed);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error(
        `Piper exited successfully but produced no audio at ${outputPath}. ` +
        `Check PIPER_PATH / PIPER_MODEL_PATH.`
      );
    }

    const durationSeconds = await probeDurationSeconds(outputPath, this.config.ffprobePath);

    return { outputPath, durationSeconds };
  }
}

function runPiper(piperPath: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug("Spawning Piper", { piperPath, args });

    const child = spawn(piperPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(stderr.length - 8192);
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start Piper ("${piperPath}"): ${err.message}. ` +
          `Is Piper installed and on PATH (or PIPER_PATH set)? ` +
          `Download from https://github.com/rhasspy/piper/releases`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Piper exited with code ${code}.\n--- stderr ---\n${stderr.trim()}`));
    });

    child.stdin?.write(text);
    child.stdin?.end();
  });
}
