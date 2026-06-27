/**
 * preview.ts  — `npm run preview`
 *
 * Renders a single test video locally WITHOUT touching Supabase at all.
 * Saved to: ./output/preview_<sign>-<mood>.mp4
 *
 * Use this to iterate quickly on font sizing, layout, scene timing,
 * themes, wheel animation and text wrapping.
 *
 * No .env file is required. No database writes happen.
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

// ── CLI ─────────────────────────────────────────────────────────────────────

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

// ── Mock data ────────────────────────────────────────────────────────────────

function buildMockRow(sign: string, mood: string): MarketingContentRow {
  const mocks: Record<string, { hook: string; card_hook: string; script: string }> = {
    pisces: {
      card_hook: "A new chapter opens when you trust your inner voice.",
      hook:      "Your intuition is speaking — are you ready to listen?",
      script:
        "Today, the universe encourages you to slow down and realign with what truly matters. " +
        "A meaningful opportunity is heading your way. " +
        "Stay open, stay positive, and take the next right step with confidence. " +
        "Your sensitivity is not a weakness — it is your greatest compass.",
    },
    aries: {
      card_hook: "The universe has been writing your story all along.",
      hook:      "Bold moves bring bold rewards — your moment is now.",
      script:
        "You stand at the beginning of a powerful new chapter. " +
        "The courage you've been building quietly is ready now. " +
        "Stop waiting for permission. The stars already gave it to you. " +
        "Move forward with the fire that has always lived inside you.",
    },
    cancer: {
      card_hook: "Your heart already knows the answer.",
      hook:      "Trust what you feel — clarity is closer than it seems.",
      script:
        "The emotional depth you carry is not a burden — it is your compass. " +
        "Trust what you feel. The answers you've been seeking are already inside you. " +
        "Let stillness guide you to clarity and let go of what no longer serves your growth.",
    },
    leo: {
      card_hook: "Your light is meant to illuminate the world.",
      hook:      "Step into the spotlight — it was made for you.",
      script:
        "Stop shrinking yourself for spaces that were never built for your magnitude. " +
        "You are allowed to take up room. " +
        "The world needs the fullness of who you are — not a dimmed version. " +
        "Shine without apology.",
    },
    scorpio: {
      card_hook: "Transformation is not the end — it is the beginning.",
      hook:      "What you're releasing is making room for something greater.",
      script:
        "The endings you're grieving were always making space for something truer. " +
        "The version of you that is emerging right now has been forged by every single thing you've survived. " +
        "Trust the becoming. The stars are with you.",
    },
  };

  const data = mocks[sign.toLowerCase()] ?? mocks["pisces"]!;

  return {
    id: 0,
    marketing_horoscope_id: null,
    sign:         sign.toLowerCase(),
    mood:         mood.toLowerCase(),
    card_text:    null,
    reel_hook:    data.hook,
    reel_script:  data.script,
    caption:      null,
    created_at:   new Date().toISOString(),
    card_hook:    data.card_hook,
    horoscope_date: new Date().toISOString().slice(0, 10),
  };
}

// ── Preview config ───────────────────────────────────────────────────────────

function buildPreviewConfig(): AppConfig {
  const outputDir = path.resolve("output");
  const tmpDir    = path.resolve("tmp");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir,    { recursive: true });

  return {
    supabaseUrl:             "preview-mode",
    supabaseServiceRoleKey:  "preview-mode",
    supabaseVideoBucket:     "social-videos",

    ffmpegPath:  process.env.FFMPEG_PATH  ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",

    wheelPath:        path.resolve(process.env.WHEEL_PATH  ?? "assets/wheel/zodiac-wheel.png"),
    musicDir:         path.resolve(process.env.MUSIC_DIR   ?? "assets/music"),
    musicTrackPath:   process.env.MUSIC_TRACK_PATH ?? "",

    brandName: process.env.BRAND_NAME ?? "Discover Rahasya",
    brandUrl:  process.env.BRAND_URL  ?? "discover-rahasya.vercel.app",

    defaultBatchLimit: 1,
    tmpDir,
    outputDir,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sign = argv.sign;
  const mood = argv.mood;

  logger.info("=== Rahasya Preview Mode ===", {
    sign,
    mood,
    note: "No Supabase — renders locally to ./output/",
  });

  const config  = buildPreviewConfig();
  const mockRow = buildMockRow(sign, mood);

  logger.info("Mock row built", {
    sign:          mockRow.sign,
    mood:          mockRow.mood,
    card_hook:     mockRow.card_hook,
    reel_hook:     mockRow.reel_hook,
    reel_script:   mockRow.reel_script,
  });

  const result = await generateVideo(mockRow, config, {
    skipUpload: true,
  });

  logger.info("=== Preview complete ===", {
    outputDir:         config.outputDir,
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
