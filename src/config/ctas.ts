/**
 * ctas.ts
 *
 * V2 CHANGE: the CTA scene's *text* is no longer a locally-authored template.
 * It now comes exclusively from Marketing AI's `video_story_website_cta`
 * field (Migration 007) -- this file must never supply CTA copy.
 *
 * What remains here is purely decorative: a small set of symbols rendered
 * above the CTA text, preserving the existing visual identity. One is
 * chosen randomly per video, same as before.
 */

export const CTA_SYMBOLS: readonly string[] = [
  "\u2726", // ✦
  "\u2727", // ✧
  "\u25C8", // ◈
  "\u27E1", // ⟡
  "\u2736", // ✶
  "\u25C7", // ◇
] as const;

/** Randomly selects one decorative CTA symbol. */
export function selectRandomCtaSymbol(): string {
  return CTA_SYMBOLS[Math.floor(Math.random() * CTA_SYMBOLS.length)] as string;
}
