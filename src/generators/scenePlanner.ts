/**
 * scenePlanner.ts
 *
 * Builds a complete VideoPlan from a MarketingContentRow.
 *
 * V2 changes (Marketing AI V2 / Migration 007 + offline narration):
 *   - Reads the six video_story_* fields (NOT the deprecated reel_script)
 *     and assembles them, in order, into narration via narrationBuilder.
 *   - Scene count is now 6 (hook, relatable_moment, emotional_realization,
 *     horoscope_connection, open_ending, cta) instead of 4.
 *   - Scene start/duration are derived from measured narration audio,
 *     not fixed windows -- the video now targets 30s (+/-1s) total.
 *   - Content is never rewritten, summarized, or regenerated here -- only
 *     word-wrapped and font-sized for display, exactly as authored.
 *   - Theme and wheel randomisation are unchanged from V1.
 *   - CTA text now comes from video_story_website_cta; only the CTA's
 *     decorative symbol is still randomly selected (visual identity only).
 */

import { AppConfig } from "../config/env";
import { MarketingContentRow } from "../types/marketingContent";
import { SceneTiming, VideoPlan } from "../types/scene";
import { selectRandomTheme } from "../config/themes";
import { selectRandomCtaSymbol } from "../config/ctas";
import { wrapTextForFile, maxCharsForFontSize } from "../utils/textUtils";
import { buildNarration, NarrationSection, StorySceneName } from "./narrationBuilder";
import { TTSProvider } from "../tts/ttsProvider";

// ── Dynamic font sizing ──────────────────────────────────────────────────────

/**
 * Picks a font size for the hook / video_story_hook text and wraps it.
 * Larger sizes for short hooks; smaller sizes for long ones.
 */
function computeHookLayout(raw: string): { fontSize: number; wrapped: string } {
  const len = raw.trim().length;
  let fontSize: number;
  if (len <= 35) fontSize = 72;
  else if (len <= 55) fontSize = 66;
  else if (len <= 75) fontSize = 58;
  else if (len <= 95) fontSize = 52;
  else fontSize = 46;

  const maxChars = maxCharsForFontSize(fontSize);
  return { fontSize, wrapped: wrapTextForFile(raw.trim(), maxChars) };
}

/**
 * Picks a font size for body / CTA text and wraps it.
 */
function computeBodyLayout(raw: string): { fontSize: number; wrapped: string } {
  const len = raw.trim().length;
  let fontSize: number;
  if (len <= 70) fontSize = 52;
  else if (len <= 110) fontSize = 46;
  else if (len <= 150) fontSize = 42;
  else fontSize = 38;

  const maxChars = maxCharsForFontSize(fontSize);
  return { fontSize, wrapped: wrapTextForFile(raw.trim(), maxChars) };
}

const SECTION_ORDER: Array<{ name: StorySceneName; field: keyof MarketingContentRow }> = [
  { name: "hook", field: "video_story_hook" },
  { name: "relatable_moment", field: "video_story_relatable_moment" },
  { name: "emotional_realization", field: "video_story_emotional_realization" },
  { name: "horoscope_connection", field: "video_story_horoscope_connection" },
  { name: "open_ending", field: "video_story_open_ending" },
  { name: "cta", field: "video_story_website_cta" },
];

// ── Main export ──────────────────────────────────────────────────────────────

export async function buildVideoPlan(
  row: MarketingContentRow,
  config: AppConfig,
  jobDir: string,
  tts: TTSProvider
): Promise<VideoPlan> {
  // ── 1. Assemble the six story sections, in order, verbatim ────────────────
  const narrationSections: NarrationSection[] = SECTION_ORDER.map(({ name, field }) => {
    const text = String(row[field] ?? "").trim();
    if (!text) {
      throw new Error(`Missing required field "${String(field)}" on marketing_content id=${row.id}`);
    }
    return { name, text };
  });

  // ── 2. Generate narration + derive scene timing from measured audio ───────
  const narration = await buildNarration(narrationSections, jobDir, config, tts);

  // ── 3. Compute per-scene display text + font size (never rewritten) ───────
  const scenes: SceneTiming[] = narration.scenes.map((s) => {
    const layout = s.name === "hook" ? computeHookLayout(s.text) : computeBodyLayout(s.text);
    return {
      name: s.name,
      start: s.start,
      duration: s.duration,
      text: layout.wrapped,
      fontSize: layout.fontSize,
    };
  });

  return {
    sign: row.sign,
    mood: row.mood,

    scenes,
    totalDuration: narration.totalDuration,
    narrationPath: narration.narrationPath,

    // Stable marketing_content row id -- used only to key deterministic
    // sequential background rotation. Never randomised.
    videoNumber: row.id,

    theme: selectRandomTheme(),
    ctaSymbol: selectRandomCtaSymbol(),

    wheelClockwise: Math.random() > 0.5,
    wheelStartAngle: Math.random() * 2 * Math.PI,
  };
}
