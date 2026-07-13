/**
 * preview.ts  -- `npm run preview`
 *
 * Renders a single test video locally WITHOUT touching Supabase at all.
 * Saved to: ./output/preview_<sign>-<mood>.mp4
 *
 * Use this to iterate quickly on Piper voice tuning, layout, scene timing,
 * themes, wheel animation and text wrapping.
 *
 * No .env file is required for Supabase. Piper still needs a real model
 * (PIPER_PATH / PIPER_MODEL_PATH), since narration is generated for real.
 * No database writes happen.
 *
 * Examples:
 *   npm run preview
 *   npm run preview -- --sign=cancer --mood=ambitious
 *   npm run preview -- --sign=scorpio --mood=reflective
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import * as fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { AppConfig } from "../config/env";
import { MarketingContentRow } from "../types/marketingContent";
import { generateVideo } from "../generators/videoGenerator";
import { logger } from "../utils/logger";

// CLI

const argv = yargs(hideBin(process.argv))
  .option("sign", {
    type: "string",
    default: "pisces",
    description: "Zodiac sign for the mock row",
  })
  .option("mood", {
    type: "string",
    default: "dreamy",
    description: "Mood for the mock row",
  })
  .help()
  .parseSync();

// Mock data -- six Marketing AI V2 video_story_* fields per sign, verbatim
// (never rewritten downstream). card_hook/reel_hook are kept for the card
// image pipeline but are NOT used for video narration.

function buildMockRow(sign: string, mood: string): MarketingContentRow {
  const mocks: Record<
    string,
    {
      card_hook: string;
      reel_hook: string;
      hook: string;
      relatable: string;
      emotional: string;
      connection: string;
      ending: string;
      cta: string;
    }
  > = {
    pisces: {
      card_hook: "A new chapter opens when you trust your inner voice.",
      reel_hook: "Your intuition is speaking -- are you ready to listen?",
      hook: "Your intuition is speaking -- are you ready to listen?",
      relatable: "You've felt it all week -- that quiet pull toward something different.",
      emotional: "It's okay that you can't explain it yet. Not everything true needs proof.",
      connection: "As a Pisces, your sensitivity is not a weakness -- it is your compass.",
      ending: "Trust what you feel today, and let it lead you somewhere new.",
      cta: "Follow Discover Rahasya for tomorrow's reading.",
    },
    aries: {
      card_hook: "The universe has been writing your story all along.",
      reel_hook: "Bold moves bring bold rewards -- your moment is now.",
      hook: "Bold moves bring bold rewards -- your moment is now.",
      relatable: "You've been holding back, waiting for the 'right' moment to act.",
      emotional: "The truth is, the courage you've been building quietly is already ready.",
      connection: "As an Aries, your fire was never meant to stay dim.",
      ending: "Stop waiting for permission. Move forward with everything you've got.",
      cta: "Your next horoscope is waiting -- come back tomorrow.",
    },
  };

  const data = mocks[sign.toLowerCase()] ?? mocks["pisces"]!;

  return {
    id: 0,
    marketing_horoscope_id: null,
    sign: sign.toLowerCase(),
    mood: mood.toLowerCase(),
    card_text: null,
    reel_hook: data.reel_hook,
    caption: null,
    hashtags: null,
    created_at: new Date().toISOString(),
    card_hook: data.card_hook,
    horoscope_date: new Date().toISOString().slice(0, 10),

    video_story_hook: data.hook,
    video_story_relatable_moment: data.relatable,
    video_story_emotional_realization: data.emotional,
    video_story_horoscope_connection: data.connection,
    video_story_open_ending: data.ending,
    video_story_website_cta: data.cta,
  };
}

// Preview config

function buildPreviewConfig(): AppConfig {
  const outputDir = path.resolve("output");
  const tmpDir = path.resolve("tmp");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  return {
    supabaseUrl: "preview-mode",
    supabaseServiceRoleKey: "preview-mode",
    supabaseVideoBucket: "social-videos",

    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",

    wheelPath: path.resolve(process.env.WHEEL_PATH ?? "assets/wheel/zodiac-wheel.png"),
    musicDir: path.resolve(process.env.MUSIC_DIR ?? "assets/music"),
    musicTrackPath: process.env.MUSIC_TRACK_PATH ?? "",

    brandName: process.env.BRAND_NAME ?? "Discover Rahasya",
    brandUrl: process.env.BRAND_URL ?? "discover-rahasya.vercel.app",

    defaultBatchLimit: 1,
    tmpDir,
    outputDir,

    piperPath: process.env.PIPER_PATH ?? "piper",
    piperModelPath: path.resolve(process.env.PIPER_MODEL_PATH ?? "assets/voice/voice.onnx"),
    piperConfigPath: process.env.PIPER_CONFIG_PATH ?? "",
    piperLengthScale: parseFloat(process.env.PIPER_LENGTH_SCALE ?? "1.05"),

    targetDurationSeconds: parseFloat(process.env.TARGET_DURATION_SECONDS ?? "30"),
    targetDurationToleranceSeconds: parseFloat(process.env.TARGET_DURATION_TOLERANCE_SECONDS ?? "1"),
    basePauseSeconds: parseFloat(process.env.BASE_PAUSE_SECONDS ?? "0.45"),
    minPauseSeconds: parseFloat(process.env.MIN_PAUSE_SECONDS ?? "0.3"),
    maxPauseSeconds: parseFloat(process.env.MAX_PAUSE_SECONDS ?? "0.6"),
    minTempo: parseFloat(process.env.MIN_TEMPO ?? "0.85"),
    maxTempo: parseFloat(process.env.MAX_TEMPO ?? "1.18"),
    ctaMinDurationSeconds: parseFloat(process.env.CTA_MIN_DURATION_SECONDS ?? "3.5"),
  };
}

// Main

async function main(): Promise<void> {
  const sign = argv.sign;
  const mood = argv.mood;

  logger.info("=== Rahasya Preview Mode ===", {
    sign,
    mood,
    note: "No Supabase -- renders locally to ./output/. Piper narration is real.",
  });

  const config = buildPreviewConfig();
  const mockRow = buildMockRow(sign, mood);

  logger.info("Mock row built", {
    sign: mockRow.sign,
    mood: mockRow.mood,
    video_story_hook: mockRow.video_story_hook,
  });

  const result = await generateVideo(mockRow, config, {
    skipUpload: true,
  });

  logger.info("=== Preview complete ===", {
    outputDir: config.outputDir,
    sign,
    mood,
    renderTimeSeconds: result.renderTimeSeconds.toFixed(1),
  });

  logger.info(
    `Open ./output/preview_${sign}-${mood}.mp4 in any video player to review.`
  );

  process.exit(0);
}

main().catch((err) => {
  logger.error("Preview failed", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
