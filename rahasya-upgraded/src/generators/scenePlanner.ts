/**
 * scenePlanner.ts
 *
 * Builds a complete VideoPlan from a MarketingContentRow.
 *
 * Changes from v1:
 *   • Fixed 24-second structure (0-5 / 5-12 / 12-19 / 19-24)
 *   • Scene 1 uses card_hook (not reel_hook)
 *   • Dynamic font sizing computed here, carried in the plan
 *   • Theme and CTA randomly selected per video
 *   • Wheel rotation direction and start angle randomised per video
 */

import { MarketingContentRow } from "../types/marketingContent";
import { SceneTiming, VideoPlan } from "../types/scene";
import { selectRandomTheme } from "../config/themes";
import { selectRandomCta } from "../config/ctas";
import { splitScriptIntoTwoParts, wrapTextForFile, maxCharsForFontSize } from "../utils/textUtils";

// ── Fixed scene durations (seconds) ─────────────────────────────────────────
const SCENE_HOOK_START     = 0;   const SCENE_HOOK_DUR     = 5;
const SCENE_SCRIPT1_START  = 5;   const SCENE_SCRIPT1_DUR  = 7;
const SCENE_SCRIPT2_START  = 12;  const SCENE_SCRIPT2_DUR  = 7;
const SCENE_CTA_START      = 19;  const SCENE_CTA_DUR      = 5;
const TOTAL_DURATION       = 24;

// ── Dynamic font sizing ──────────────────────────────────────────────────────

/**
 * Picks a font size for the hook / card_hook text and wraps it for FFmpeg.
 * Larger sizes for short hooks; smaller sizes for long ones.
 */
function computeHookLayout(raw: string): { fontSize: number; wrapped: string } {
  const len = raw.trim().length;
  let fontSize: number;
  if (len <= 35)       fontSize = 72;
  else if (len <= 55)  fontSize = 66;
  else if (len <= 75)  fontSize = 58;
  else if (len <= 95)  fontSize = 52;
  else                 fontSize = 46;

  const maxChars = maxCharsForFontSize(fontSize);
  return { fontSize, wrapped: wrapTextForFile(raw.trim(), maxChars) };
}

/**
 * Picks a font size for body script text and wraps it.
 */
function computeScriptLayout(raw: string): { fontSize: number; wrapped: string } {
  const len = raw.trim().length;
  let fontSize: number;
  if (len <= 70)        fontSize = 52;
  else if (len <= 110)  fontSize = 46;
  else if (len <= 150)  fontSize = 42;
  else                  fontSize = 38;

  const maxChars = maxCharsForFontSize(fontSize);
  return { fontSize, wrapped: wrapTextForFile(raw.trim(), maxChars) };
}

// ── Main export ──────────────────────────────────────────────────────────────

export function buildVideoPlan(row: MarketingContentRow): VideoPlan {
  // Scene 1: card_hook preferred, fall back to reel_hook
  const rawHook = (row.card_hook?.trim() || row.reel_hook.trim());
  const hookLayout = computeHookLayout(rawHook);

  // Scenes 2 & 3: sentence-aware split of reel_script
  const [rawPart1, rawPart2] = splitScriptIntoTwoParts(row.reel_script);
  const script1Layout = computeScriptLayout(rawPart1);
  const script2Layout = computeScriptLayout(rawPart2);

  const scenes: SceneTiming[] = [
    { name: "hook",         start: SCENE_HOOK_START,    duration: SCENE_HOOK_DUR    },
    { name: "script_part1", start: SCENE_SCRIPT1_START, duration: SCENE_SCRIPT1_DUR },
    { name: "script_part2", start: SCENE_SCRIPT2_START, duration: SCENE_SCRIPT2_DUR },
    { name: "cta",          start: SCENE_CTA_START,     duration: SCENE_CTA_DUR     },
  ];

  return {
    sign: row.sign,
    mood: row.mood,

    cardHook: hookLayout.wrapped,
    hookFontSize: hookLayout.fontSize,

    scriptPart1: script1Layout.wrapped,
    scriptPart1FontSize: script1Layout.fontSize,

    scriptPart2: script2Layout.wrapped,
    scriptPart2FontSize: script2Layout.fontSize,

    scenes,
    totalDuration: TOTAL_DURATION,

    theme: selectRandomTheme(),
    cta:   selectRandomCta(),

    wheelClockwise:  Math.random() > 0.5,
    wheelStartAngle: Math.random() * 2 * Math.PI,
  };
}
