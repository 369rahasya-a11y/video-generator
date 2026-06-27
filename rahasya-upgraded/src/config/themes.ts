/**
 * themes.ts
 *
 * Defines the five premium dark visual themes for Discover Rahasya videos.
 * Each theme controls: background gradient, accent colour, wheel opacity.
 * The renderer selects one randomly per video, creating natural variation
 * while keeping the same luxury brand identity.
 */

export interface VideoTheme {
  readonly id: string;
  readonly name: string;
  /** Hex colour used as the bright centre of the radial background gradient */
  readonly bgCenter: string;
  /** Hex colour used for the edges / corners of the background */
  readonly bgEdge: string;
  /** Accent colour used for mood text and small decorative highlights */
  readonly accentColor: string;
  /** Zodiac wheel overlay opacity – keep subtle (0.08–0.16) */
  readonly wheelOpacity: number;
  /** Vignette strength passed to FFmpeg vignette filter (radians, PI/4–PI/2) */
  readonly vignetteAngle: string;
}

export const THEMES: readonly VideoTheme[] = [
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    bgCenter: "#16245E",
    bgEdge: "#060912",
    accentColor: "#7BAED9",
    wheelOpacity: 0.12,
    vignetteAngle: "PI/3.5",
  },
  {
    id: "royal-purple",
    name: "Royal Purple",
    bgCenter: "#2A1658",
    bgEdge: "#0A0514",
    accentColor: "#B07DD9",
    wheelOpacity: 0.12,
    vignetteAngle: "PI/3.5",
  },
  {
    id: "deep-burgundy",
    name: "Deep Burgundy",
    bgCenter: "#481218",
    bgEdge: "#100408",
    accentColor: "#D97B8A",
    wheelOpacity: 0.10,
    vignetteAngle: "PI/4",
  },
  {
    id: "dark-teal",
    name: "Dark Teal",
    bgCenter: "#0C3A3A",
    bgEdge: "#030E0E",
    accentColor: "#7DD9C8",
    wheelOpacity: 0.12,
    vignetteAngle: "PI/3.5",
  },
  {
    id: "charcoal-black",
    name: "Charcoal Black",
    bgCenter: "#262626",
    bgEdge: "#080808",
    accentColor: "#D4AF37",
    wheelOpacity: 0.15,
    vignetteAngle: "PI/4",
  },
] as const;

/** Randomly selects one of the five premium themes. */
export function selectRandomTheme(): VideoTheme {
  return THEMES[Math.floor(Math.random() * THEMES.length)] as VideoTheme;
}
