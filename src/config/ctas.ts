/**
 * ctas.ts
 *
 * Twelve premium Call-To-Action templates for the final scene (19–24 s).
 * One is chosen randomly per video. Add new CTAs here without touching
 * any renderer code.
 *
 * Design rules:
 *   • mainText   — 1–2 lines, may contain \n for forced line break
 *   • subText    — optional follow-up line (shorter, lighter weight)
 *   • symbol     — single decorative character rendered above the text block
 */

export interface CtaContent {
  readonly id: string;
  readonly mainText: string;
  readonly subText?: string;
  readonly symbol: string;
}

export const CTAS: readonly CtaContent[] = [
  {
    id: "cta-01",
    mainText: "Follow Discover Rahasya\nfor tomorrow's reading.",
    symbol: "✦",
  },
  {
    id: "cta-02",
    mainText: "The universe still has\nmore to reveal.",
    subText: "Come back tomorrow.",
    symbol: "✧",
  },
  {
    id: "cta-03",
    mainText: "Your next message\nis waiting.",
    subText: "Come back tomorrow for more guidance.",
    symbol: "◈",
  },
  {
    id: "cta-04",
    mainText: "Your destiny\ncontinues tomorrow.",
    subText: "Don't miss it.",
    symbol: "⟡",
  },
  {
    id: "cta-05",
    mainText: "Every zodiac\nhas another story.",
    subText: "Continue your journey tomorrow.",
    symbol: "✶",
  },
  {
    id: "cta-06",
    mainText: "Continue your\ncosmic journey.",
    subText: "See you tomorrow.",
    symbol: "✦",
  },
  {
    id: "cta-07",
    mainText: "Your next horoscope\nis waiting.",
    symbol: "◇",
  },
  {
    id: "cta-08",
    mainText: "Follow for daily\ncosmic guidance.",
    symbol: "✧",
  },
  {
    id: "cta-09",
    mainText: "The stars never\nstop speaking.",
    subText: "Listen again tomorrow.",
    symbol: "✶",
  },
  {
    id: "cta-10",
    mainText: "A new insight\nawaits you tomorrow.",
    symbol: "◈",
  },
  {
    id: "cta-11",
    mainText: "The universe has\nsomething new for you.",
    subText: "Come back tomorrow.",
    symbol: "⟡",
  },
  {
    id: "cta-12",
    mainText: "Stay tuned for\ntomorrow's cosmic message.",
    symbol: "✦",
  },
] as const;

/** Randomly selects one of the twelve CTA templates. */
export function selectRandomCta(): CtaContent {
  return CTAS[Math.floor(Math.random() * CTAS.length)] as CtaContent;
}
