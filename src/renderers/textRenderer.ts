/**
 * textRenderer.ts -- Premium Visual Engine
 *
 * Builds the complete FFmpeg -filter_complex string for one Discover Rahasya
 * video. Every design decision here is preserved from V1 -- only the scene
 * count/timing changed (6 dynamically-timed scenes instead of 4 fixed ones):
 *
 *   - Luxury dark background (theme-specific gradient PNG)
 *   - Zodiac wheel overlay -- rotates slowly throughout the entire video
 *   - Permanent "DISCOVER / RAHASYA" branding in the top-left corner
 *   - Scene "hook":                Large symbol . Sign . Mood . hook text
 *   - Scenes "relatable_moment",
 *     "emotional_realization",
 *     "horoscope_connection",
 *     "open_ending":               Centered body text (one story section each)
 *   - Scene "cta":                 Decorative CTA -> "Discover Rahasya" -> URL
 *
 * All text is read from per-scene textfiles (never inline) so content can
 * contain any character without breaking the filtergraph syntax.
 */

import { VideoPlan } from "../types/scene";
import { ResolvedFonts } from "../utils/fontResolver";

// Colour palette
const C = {
  gold: "#D4AF37",
  goldBright: "#F0CE5E",
  goldDim: "#B8922A",
  softWhite: "#F5F3EE",
  offWhite: "#E8E4DC",
} as const;

// Fade duration for scene transitions (seconds)
const FADE = 0.45;

// Gold separator used in CTA
const GOLD_RULE = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";

// Exported text-file path map. `sceneText` is index-aligned with plan.scenes
// (6 entries: hook, relatable_moment, emotional_realization,
// horoscope_connection, open_ending, cta).
export interface SceneTextFiles {
  brand1: string; // "DISCOVER"
  brand2: string; // "RAHASYA"

  hookSymbol: string; // Unicode zodiac glyph
  hookSign: string;   // e.g. "PISCES"
  hookMood: string;   // formatted mood string

  sceneText: string[]; // one text file per scene, in plan.scenes order

  ctaSymbol: string; // decorative character
  ctaSep: string;    // gold rule
  ctaBrand: string;  // brand name
  ctaUrl: string;    // website URL
}

// Expression helpers

function fadeAlpha(start: number, end: number, fade = FADE): string {
  const effectiveFade = Math.min(fade, Math.max(0.05, (end - start) / 2 - 0.01));
  const s = start.toFixed(4);
  const e = end.toFixed(4);
  const fi = (start + effectiveFade).toFixed(4);
  const fo = (end - effectiveFade).toFixed(4);
  const f = effectiveFade.toFixed(4);
  return `if(lt(t,${fi}),(t-${s})/${f},if(gt(t,${fo}),(${e}-t)/${f},1))`;
}

function enableBetween(start: number, end: number): string {
  return `between(t,${start.toFixed(4)},${end.toFixed(4)})`;
}

// Drawtext helper

function dt(
  fontFile: string,
  fontSize: number,
  color: string,
  textFile: string,
  xExpr: string,
  yExpr: string,
  start: number,
  end: number,
  spacing = 10,
  permanent = false,
  totalDuration = 0
): string {
  const ff = `'${fontFile}'`;
  const tf = `'${textFile}'`;
  const alpha = permanent ? "1" : `'${fadeAlpha(start, end)}'`;
  const enable = permanent
    ? `'between(t,0,${totalDuration.toFixed(4)})'`
    : `'${enableBetween(start, end)}'`;

  return (
    `drawtext` +
    `=fontfile=${ff}` +
    `:fontsize=${fontSize}` +
    `:fontcolor=${color}` +
    `:textfile=${tf}` +
    `:text_align=C` +
    `:line_spacing=${spacing}` +
    `:x=${xExpr}` +
    `:y=${yExpr}` +
    `:enable=${enable}` +
    `:alpha=${alpha}`
  );
}

// Main export

/**
 * Builds the complete FFmpeg -filter_complex string for one video.
 */
export function buildFilterComplex(
  plan: VideoPlan,
  textFiles: SceneTextFiles,
  fonts: ResolvedFonts,
  bgIndex: number,
  wheelIndex: number
): string {
  const { scenes, theme, wheelClockwise, wheelStartAngle, totalDuration } = plan;

  const hookScene = scenes.find((s) => s.name === "hook")!;
  const ctaScene = scenes.find((s) => s.name === "cta")!;
  const bodyScenes = scenes.filter(
    (s) => s.name !== "hook" && s.name !== "cta"
  );

  const accent = theme.accentColor;
  const parts: string[] = [];

  // Part 1: Scale background PNG into a 30fps 1080x1920 stream
  parts.push(
    `[${bgIndex}:v]` +
    `scale=1080:1920:force_original_aspect_ratio=disable,` +
    `fps=30,` +
    `setsar=1` +
    `[base]`
  );

  // Part 2: Zodiac wheel overlay (rotates slowly beneath all text)
  let composited: string;

  if (wheelIndex >= 0) {
    const rotDir = wheelClockwise ? 1 : -1;
    const rotSpeed = (rotDir * 0.04189).toFixed(6); // 2*pi/150
    const rotOff = wheelStartAngle.toFixed(4);

    parts.push(
      `[${wheelIndex}:v]` +
      `format=rgba,` +
      `scale=1200:1200,` +
      `rotate=(t*${rotSpeed}+${rotOff}):c=0x00000000:ow=1200:oh=1200:bilinear=0,` +
      `colorchannelmixer=aa=${theme.wheelOpacity}` +
      `[wheel_layer]`
    );
    parts.push(
      `[base][wheel_layer]` +
      `overlay=x=(W-w)/2:y=(H-h)/2` +
      `[composited]`
    );
    composited = "[composited]";
  } else {
    composited = "[base]";
  }

  // Part 3: Permanent top-left branding (visible for the whole video)
  parts.push(
    `${composited}` +
    dt(fonts.bold, 20, C.goldBright, textFiles.brand1, "65", "82", 0, totalDuration, 0, true, totalDuration) +
    `[vBrand1]`
  );
  parts.push(
    `[vBrand1]` +
    dt(fonts.bold, 20, C.softWhite, textFiles.brand2, "65", "108", 0, totalDuration, 0, true, totalDuration) +
    `[vBrand2]`
  );

  let lastLabel = "vBrand2";
  let stageIdx = 0;
  const nextLabel = () => `v${stageIdx++}`;

  // Part 4: Hook scene -- symbol, sign, mood, hook text
  {
    const h1s = hookScene.start;
    const h1e = h1s + hookScene.duration;

    const l1 = nextLabel();
    parts.push(
      `[${lastLabel}]` +
      dt(fonts.bold, 200, C.goldBright, textFiles.hookSymbol, "(w-text_w)/2", "h*0.16", h1s, h1e, 0) +
      `[${l1}]`
    );
    const l2 = nextLabel();
    parts.push(
      `[${l1}]` +
      dt(fonts.bold, 72, C.softWhite, textFiles.hookSign, "(w-text_w)/2", "h*0.30", h1s, h1e, 0) +
      `[${l2}]`
    );
    const l3 = nextLabel();
    parts.push(
      `[${l2}]` +
      dt(fonts.regular, 28, accent, textFiles.hookMood, "(w-text_w)/2", "h*0.40", h1s, h1e, 0) +
      `[${l3}]`
    );
    const l4 = nextLabel();
    parts.push(
      `[${l3}]` +
      dt(fonts.bold, hookScene.fontSize, C.softWhite, textFiles.sceneText[0], "(w-text_w)/2", "h*0.52", h1s, h1e, 14) +
      `[${l4}]`
    );
    lastLabel = l4;
  }

  // Part 5: Body scenes -- centered text, one per remaining story section
  for (const scene of bodyScenes) {
    const idx = scenes.indexOf(scene);
    const s = scene.start;
    const e = s + scene.duration;
    const label = nextLabel();
    parts.push(
      `[${lastLabel}]` +
      dt(fonts.regular, scene.fontSize, C.softWhite, textFiles.sceneText[idx], "(w-text_w)/2", "(h-text_h)/2", s, e, 16) +
      `[${label}]`
    );
    lastLabel = label;
  }

  // Part 6: CTA scene -- decorative symbol, video_story_website_cta text, separator, brand, url
  {
    const s4s = ctaScene.start;
    const s4e = s4s + ctaScene.duration;
    const ctaIdx = scenes.indexOf(ctaScene);

    const l1 = nextLabel();
    parts.push(
      `[${lastLabel}]` +
      dt(fonts.regular, 38, accent, textFiles.ctaSymbol, "(w-text_w)/2", "h/2-235", s4s, s4e, 0) +
      `[${l1}]`
    );
    const l2 = nextLabel();
    parts.push(
      `[${l1}]` +
      dt(fonts.regular, 38, C.offWhite, textFiles.sceneText[ctaIdx], "(w-text_w)/2", "h/2-180", s4s, s4e, 12) +
      `[${l2}]`
    );
    const l3 = nextLabel();
    parts.push(
      `[${l2}]` +
      dt(fonts.regular, 24, C.goldDim, textFiles.ctaSep, "(w-text_w)/2", "h/2+55", s4s, s4e, 0) +
      `[${l3}]`
    );
    const l4 = nextLabel();
    parts.push(
      `[${l3}]` +
      dt(fonts.bold, 54, C.gold, textFiles.ctaBrand, "(w-text_w)/2", "h/2+100", s4s, s4e, 0) +
      `[${l4}]`
    );
    parts.push(
      `[${l4}]` +
      dt(fonts.regular, 44, C.goldDim, textFiles.ctaUrl, "(w-text_w)/2", "h/2+220", s4s, s4e, 0) +
      `[vout]`
    );
  }

  return parts.join(";\n");
}

/** Exported for use in sceneRenderer.ts when writing text content files. */
export { GOLD_RULE };
