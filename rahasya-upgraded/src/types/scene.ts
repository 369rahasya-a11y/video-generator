/**
 * scene.ts — Core type definitions for the video rendering pipeline.
 *
 * VideoPlan is the single source of truth passed from scenePlanner → renderer.
 * It now includes the selected theme, CTA, font sizes, and wheel rotation
 * parameters so the renderer is fully declarative and testable.
 */

import { VideoTheme } from "../config/themes";
import { CtaContent } from "../config/ctas";

/**
 * A single scene's position on the global 24-second timeline.
 * All four scenes always occupy fixed windows totalling exactly 24 s.
 */
export interface SceneTiming {
  name: "hook" | "script_part1" | "script_part2" | "cta";
  start: number;
  duration: number;
}

/**
 * Complete rendering plan for one video.
 * Produced by scenePlanner.ts, consumed by sceneRenderer.ts.
 */
export interface VideoPlan {
  // ── Content ────────────────────────────────────────────────────────────────
  sign: string;
  mood: string;

  /** card_hook text (word-wrapped lines separated by \n). Falls back to reel_hook. */
  cardHook: string;
  /** Computed font size (px) for the hook text block */
  hookFontSize: number;

  /** First half of reel_script — sentence-aware split, word-wrapped */
  scriptPart1: string;
  scriptPart1FontSize: number;

  /** Second half of reel_script — sentence-aware split, word-wrapped */
  scriptPart2: string;
  scriptPart2FontSize: number;

  // ── Timeline ───────────────────────────────────────────────────────────────
  scenes: SceneTiming[];

  /** Fixed at 24.000 seconds */
  totalDuration: number;

  // ── Visual ─────────────────────────────────────────────────────────────────
  /** The premium dark theme selected for this video */
  theme: VideoTheme;

  /** The CTA block selected for the final scene */
  cta: CtaContent;

  // ── Zodiac Wheel ───────────────────────────────────────────────────────────
  /** true = clockwise, false = counter-clockwise */
  wheelClockwise: boolean;
  /** Starting rotation angle in radians (randomised per video) */
  wheelStartAngle: number;
}
