/**
 * textRenderer.ts — Premium Visual Engine
 *
 * Builds the complete FFmpeg -filter_complex string for one Discover Rahasya
 * video. Every design decision is made here:
 *
 *   • Luxury dark background (theme-specific gradient PNG)
 *   • Zodiac wheel overlay — rotates slowly throughout the entire video
 *   • Permanent "DISCOVER / RAHASYA" branding in the top-left corner
 *   • Scene 1 (0-5 s):   Large symbol · Sign · Mood · card_hook text
 *   • Scene 2 (5-12 s):  Script Part 1 (centered)
 *   • Scene 3 (12-19 s): Script Part 2 (centered)
 *   • Scene 4 (19-24 s): Decorative CTA → "Discover Rahasya" → URL
 *
 * All text is read from per-scene textfiles (never inline) so content can
 * contain any character without breaking the filtergraph syntax.
 */

import { VideoPlan } from "../types/scene";
import { ResolvedFonts } from "../utils/fontResolver";

// ── Colour palette ───────────────────────────────────────────────────────────
const C = {
  gold:       "#D4AF37",
  goldBright: "#F0CE5E",
  goldDim:    "#B8922A",
  softWhite:  "#F5F3EE",
  offWhite:   "#E8E4DC",
} as const;

// Fade duration for scene transitions (seconds)
const FADE = 0.45;

// Gold separator used in CTA
const GOLD_RULE = "──────────────────────";

// ── Exported text-file path map ──────────────────────────────────────────────

export interface SceneTextFiles {
  // Permanent branding (all scenes 0-24 s)
  brand1:       string;  // "DISCOVER"
  brand2:       string;  // "RAHASYA"

  // Scene 1: Hook (0-5 s)
  s1Symbol:     string;  // Unicode zodiac glyph
  s1Sign:       string;  // e.g. "PISCES"
  s1Mood:       string;  // formatted mood string
  s1Hook:       string;  // card_hook, word-wrapped

  // Scene 2: Script Part 1 (5-12 s)
  s2Script:     string;

  // Scene 3: Script Part 2 (12-19 s)
  s3Script:     string;

  // Scene 4: CTA (19-24 s)
  s4CtaSymbol:  string;  // decorative character
  s4CtaText:    string;  // main + optional secondary lines
  s4Sep:        string;  // "──────────────────────"
  s4Brand:      string;  // "Discover Rahasya"
  s4Url:        string;  // website URL
}

// ── Expression helpers ───────────────────────────────────────────────────────

/**
 * Per-element fade-in / hold / fade-out alpha expression.
 * Returns a value in [0, 1] throughout the scene window.
 */
function fadeAlpha(start: number, end: number, fade = FADE): string {
  const s  = start.toFixed(4);
  const e  = end.toFixed(4);
  const fi = (start + fade).toFixed(4);
  const fo = (end   - fade).toFixed(4);
  const f  = fade.toFixed(4);
  return `if(lt(t,${fi}),(t-${s})/${f},if(gt(t,${fo}),(${e}-t)/${f},1))`;
}

/** Active only between start and end seconds. */
function enableBetween(start: number, end: number): string {
  return `between(t,${start.toFixed(4)},${end.toFixed(4)})`;
}

// ── Drawtext helper ──────────────────────────────────────────────────────────

/**
 * Builds a single drawtext filter string.
 *
 * @param fontFile  Absolute path to the .ttf font
 * @param fontSize  Size in pixels
 * @param color     Hex colour e.g. "#F5F3EE"
 * @param textFile  Absolute path to the per-scene content textfile
 * @param xExpr     FFmpeg x-expression (usually "(w-text_w)/2" to centre)
 * @param yExpr     FFmpeg y-expression
 * @param start     Scene start time (seconds)
 * @param end       Scene end time (seconds)
 * @param spacing   Extra line-spacing in pixels
 * @param permanent If true, alpha=1 and enable covers full 0-24 s window
 */
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
  permanent = false
): string {
  const ff = `'${fontFile}'`;
  const tf = `'${textFile}'`;
  const alpha  = permanent ? "1" : `'${fadeAlpha(start, end)}'`;
  const enable = permanent
    ? `'between(t,0,24)'`
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

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Builds the complete FFmpeg -filter_complex string for one video.
 *
 * @param plan        Video plan (theme, CTA, font sizes, timing, wheel params)
 * @param textFiles   Paths to all per-scene text content files
 * @param fonts       Resolved bold + regular font paths
 * @param bgIndex     FFmpeg input index for the background PNG
 * @param wheelIndex  FFmpeg input index for the zodiac wheel PNG (-1 = absent)
 */
export function buildFilterComplex(
  plan: VideoPlan,
  textFiles: SceneTextFiles,
  fonts: ResolvedFonts,
  bgIndex: number,
  wheelIndex: number
): string {
  const { scenes, theme, wheelClockwise, wheelStartAngle } = plan;

  const hookScene    = scenes.find((s) => s.name === "hook")!;
  const script1Scene = scenes.find((s) => s.name === "script_part1")!;
  const script2Scene = scenes.find((s) => s.name === "script_part2")!;
  const ctaScene     = scenes.find((s) => s.name === "cta")!;

  // Scene time boundaries
  const h1s = hookScene.start;    const h1e = h1s + hookScene.duration;
  const s2s = script1Scene.start; const s2e = s2s + script1Scene.duration;
  const s3s = script2Scene.start; const s3e = s3s + script2Scene.duration;
  const s4s = ctaScene.start;     const s4e = s4s + ctaScene.duration;

  // Accent colour for mood and CTA decorative elements
  const accent = theme.accentColor;

  const parts: string[] = [];

  // ── Part 1: Scale background PNG into a 30fps 1080×1920 stream ────────────
  parts.push(
    `[${bgIndex}:v]` +
    `scale=1080:1920:force_original_aspect_ratio=disable,` +
    `fps=30,` +
    `setsar=1` +
    `[base]`
  );

  // ── Part 2: Zodiac wheel overlay ──────────────────────────────────────────
  //
  // The wheel is a 1600×1600 RGBA layer that rotates slowly beneath all text.
  // A 1600px wheel overlaid on a 1080×1920 canvas:
  //   x = (1080 - 1600) / 2 = -260  → clips 260 px each side (fine; wheel is circular)
  //   y = (1920 - 1600) / 2 =  160  → 160 px margin top and bottom
  //
  // Rotation speed: 1 revolution per ~150 s (2.5 min) = 0.0419 rad/s
  // Direction randomised per video for variety.

  let composited: string;

  if (wheelIndex >= 0) {
    const rotDir   = wheelClockwise ? 1 : -1;
    const rotSpeed = (rotDir * 0.04189).toFixed(6); // 2π/150
    const rotOff   = wheelStartAngle.toFixed(4);

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
    // No wheel available — pass base directly
    composited = "[base]";
  }

  // ── Part 3: Permanent top-left branding (visible all 24 s) ───────────────
  //
  //   DISCOVER   ← 20 px, gold, x=65 y=82
  //   RAHASYA    ← 20 px, soft white, x=65 y=108
  //
  // Small, elegant, never animated. The spec calls for this in every scene.

  parts.push(
    `${composited}` +
    dt(fonts.bold, 20, C.goldBright, textFiles.brand1, "65", "82",  0, 24, 0, true) +
    `[vBrand1]`
  );
  parts.push(
    `[vBrand1]` +
    dt(fonts.bold, 20, C.softWhite,  textFiles.brand2, "65", "108", 0, 24, 0, true) +
    `[vBrand2]`
  );

  // ── Part 4: Scene 1 — Hook (0-5 s) ────────────────────────────────────────
  //
  // Layout from top to bottom:
  //   h*0.16  → Large zodiac symbol      (200 px, gold, centred)
  //   h*0.30  → Sign name e.g. "PISCES"  (72 px, soft-white, centred)
  //   h*0.40  → Mood keywords            (28 px, accent colour, centred)
  //   h*0.52  → card_hook text           (dynamic size, soft-white, centred)

  parts.push(
    `[vBrand2]` +
    dt(fonts.bold, 200, C.goldBright, textFiles.s1Symbol,
       "(w-text_w)/2", "h*0.16", h1s, h1e, 0) +
    `[v1a]`
  );
  parts.push(
    `[v1a]` +
    dt(fonts.bold, 72, C.softWhite, textFiles.s1Sign,
       "(w-text_w)/2", "h*0.30", h1s, h1e, 0) +
    `[v1b]`
  );
  parts.push(
    `[v1b]` +
    dt(fonts.regular, 28, accent, textFiles.s1Mood,
       "(w-text_w)/2", "h*0.40", h1s, h1e, 0) +
    `[v1c]`
  );
  parts.push(
    `[v1c]` +
    dt(fonts.bold, plan.hookFontSize, C.softWhite, textFiles.s1Hook,
       "(w-text_w)/2", "h*0.52", h1s, h1e, 14) +
    `[v1d]`
  );

  // ── Part 5: Scene 2 — Script Part 1 (5-12 s) ────────────────────────────
  //
  // Body text, perfectly centred on the canvas.
  // Larger line spacing (16 px) for comfortable reading on mobile.

  parts.push(
    `[v1d]` +
    dt(fonts.regular, plan.scriptPart1FontSize, C.softWhite, textFiles.s2Script,
       "(w-text_w)/2", "(h-text_h)/2", s2s, s2e, 16) +
    `[v2]`
  );

  // ── Part 6: Scene 3 — Script Part 2 (12-19 s) ───────────────────────────
  //
  // Same layout as Scene 2; only content changes.

  parts.push(
    `[v2]` +
    dt(fonts.regular, plan.scriptPart2FontSize, C.softWhite, textFiles.s3Script,
       "(w-text_w)/2", "(h-text_h)/2", s3s, s3e, 16) +
    `[v3]`
  );

  // ── Part 7: Scene 4 — CTA (19-24 s) ─────────────────────────────────────
  //
  // Vertical layout (centred around h/2 = 960):
  //   h/2 - 235  → Decorative symbol  (38 px, accent, centred)
  //   h/2 - 180  → CTA text 1-2 lines (38 px, off-white, centred)
  //   h/2 +  55  → Gold separator     (24 px, gold dim, centred)
  //   h/2 + 100  → "Discover Rahasya" (54 px, gold, centred)
  //   h/2 + 190  → Website URL        (24 px, gold dim, centred)

  parts.push(
    `[v3]` +
    dt(fonts.regular, 38, accent, textFiles.s4CtaSymbol,
       "(w-text_w)/2", "h/2-235", s4s, s4e, 0) +
    `[v4a]`
  );
  parts.push(
    `[v4a]` +
    dt(fonts.regular, 38, C.offWhite, textFiles.s4CtaText,
       "(w-text_w)/2", "h/2-180", s4s, s4e, 12) +
    `[v4b]`
  );
  parts.push(
    `[v4b]` +
    dt(fonts.regular, 24, C.goldDim, textFiles.s4Sep,
       "(w-text_w)/2", "h/2+55", s4s, s4e, 0) +
    `[v4c]`
  );
  parts.push(
    `[v4c]` +
    dt(fonts.bold, 54, C.gold, textFiles.s4Brand,
       "(w-text_w)/2", "h/2+100", s4s, s4e, 0) +
    `[v4d]`
  );
  parts.push(
    `[v4d]` +
    dt(fonts.regular, 24, C.goldDim, textFiles.s4Url,
       "(w-text_w)/2", "h/2+190", s4s, s4e, 0) +
    `[vout]`
  );

  return parts.join(";\n");
}

/** Exported for use in sceneRenderer.ts when writing text content files. */
export { GOLD_RULE };
