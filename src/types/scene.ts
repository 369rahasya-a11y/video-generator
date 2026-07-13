/**
 * scene.ts — Core type definitions for the video rendering pipeline.
 *
 * VideoPlan is the single source of truth passed from scenePlanner -> renderer.
 *
 * V2 change: scenes are no longer fixed 24s windows. There are now six
 * scenes -- one per Marketing AI V2 video_story_* field -- whose start/duration
 * are derived from measured narration audio (see narrationBuilder.ts), so the
 * total runtime targets 30s (+/-1s) while preserving every word of the story.
 */

import { VideoTheme } from "../config/themes";
import { StorySceneName } from "../generators/narrationBuilder";

/** A single scene's position on the (variable-length) timeline. */
export interface SceneTiming {
  name: StorySceneName;
  start: number;
  duration: number;
  /** Word-wrapped display text for this scene. */
  text: string;
  /** Computed font size (px) for this scene's text block. */
  fontSize: number;
}

/**
 * Complete rendering plan for one video.
 * Produced by scenePlanner.ts, consumed by sceneRenderer.ts.
 */
export interface VideoPlan {
  // Content
  sign: string;
  mood: string;

  // Timeline: hook, relatable_moment, emotional_realization,
  // horoscope_connection, open_ending, cta -- in order.
  scenes: SceneTiming[];

  /** Sum of all scene durations. Targets 30.0s (+/-1s). */
  totalDuration: number;

  // Narration
  /** Absolute path to the final assembled narration WAV (padded to totalDuration). */
  narrationPath: string;

  // Visual
  /** The premium dark theme selected for this video */
  theme: VideoTheme;

  /** Decorative CTA symbol (visual identity only -- CTA text comes from video_story_website_cta). */
  ctaSymbol: string;

  // Zodiac Wheel
  /** true = clockwise, false = counter-clockwise */
  wheelClockwise: boolean;
  /** Starting rotation angle in radians (randomised per video) */
  wheelStartAngle: number;
}
