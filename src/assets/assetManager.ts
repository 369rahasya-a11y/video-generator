/**
 * assetManager.ts -- Centralized Production Asset Manager
 *
 * Single source of truth for the two production asset types introduced by
 * the asset-integration upgrade:
 *
 *   - Backgrounds (assets/backgrounds/*.png) -- real production scenes,
 *     used in FIXED SEQUENTIAL ROTATION (never random).
 *   - Zodiac artwork (assets/zodiac/<sign>.png) -- real per-sign artwork,
 *     replacing the previously programmatically-drawn zodiac symbol.
 *
 * Responsibilities:
 *   - Scan each asset directory exactly once per process and cache the
 *     result (no repeated directory scans on every video).
 *   - Provide deterministic sequential background rotation by video number.
 *   - Provide zodiac artwork lookup by sign, with path caching.
 *   - Validate asset availability and log warnings for anything missing --
 *     this module NEVER throws; callers always get a usable (possibly null)
 *     result and fall back gracefully.
 *
 * No other module should read assets/backgrounds or assets/zodiac directly
 * -- all paths flow through here so caching and rotation logic live in one
 * place.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const ZODIAC_SIGNS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
] as const;

// ---------------------------------------------------------------------------
// Backgrounds -- fixed sequential rotation (never random)
// ---------------------------------------------------------------------------

let backgroundListCache: string[] | null = null;
let backgroundDirCached: string | null = null;

/**
 * Scans the backgrounds directory once and caches the result. Filenames are
 * sorted alphabetically so the rotation order is stable and reproducible
 * across processes, machines, and OSes (raw directory read order is NOT
 * guaranteed by the filesystem, but a sort always is).
 */
function loadBackgroundList(backgroundsDir: string): string[] {
  if (backgroundListCache !== null && backgroundDirCached === backgroundsDir) {
    return backgroundListCache;
  }

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(backgroundsDir)
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    logger.warn(`Could not read backgrounds directory: ${backgroundsDir}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    files = [];
  }

  if (files.length === 0) {
    logger.warn(
      `No background images found in "${backgroundsDir}". ` +
      `Rendering will fall back to the procedural gradient background.`
    );
  } else {
    logger.info(`Background asset pack loaded: ${files.length} image(s) from ${backgroundsDir}`, {
      order: files,
    });
  }

  backgroundListCache = files.map((f) => path.join(backgroundsDir, f));
  backgroundDirCached = backgroundsDir;
  return backgroundListCache;
}

/**
 * Returns the background image path for a given 1-based video number, using
 * FIXED SEQUENTIAL ROTATION:
 *
 *   Video 1 -> Background 1
 *   Video 2 -> Background 2
 *   ...
 *   Video N -> Background N
 *   Video N+1 -> Background 1  (cycle repeats forever)
 *
 * Implementation: backgroundIndex = (videoNumber - 1) % totalBackgrounds
 *
 * This is deterministic and stateless -- no shuffling, no randomness, and
 * no "already used" tracking is needed because the same videoNumber always
 * maps to the same background.
 *
 * Returns null if no background assets are available; the caller is
 * responsible for falling back (e.g. to the legacy procedural generator).
 */
export function getBackgroundForVideoNumber(
  videoNumber: number,
  backgroundsDir: string
): string | null {
  const backgrounds = loadBackgroundList(backgroundsDir);
  if (backgrounds.length === 0) return null;

  const safeVideoNumber =
    Number.isFinite(videoNumber) && videoNumber > 0 ? Math.floor(videoNumber) : 1;

  const index = (safeVideoNumber - 1) % backgrounds.length;
  return backgrounds[index] as string;
}

// ---------------------------------------------------------------------------
// Zodiac artwork -- lookup by sign
// ---------------------------------------------------------------------------

let zodiacPathCache: Map<string, string> | null = null;
let zodiacDirCached: string | null = null;

function loadZodiacMap(zodiacDir: string): Map<string, string> {
  if (zodiacPathCache !== null && zodiacDirCached === zodiacDir) {
    return zodiacPathCache;
  }

  const map = new Map<string, string>();
  const missing: string[] = [];

  for (const sign of ZODIAC_SIGNS) {
    const candidate = path.join(zodiacDir, `${sign}.png`);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
        map.set(sign, candidate);
      } else {
        missing.push(sign);
      }
    } catch {
      missing.push(sign);
    }
  }

  if (missing.length > 0) {
    logger.warn(
      `Missing zodiac artwork for sign(s) [${missing.join(", ")}] in "${zodiacDir}". ` +
      `These signs will fall back to the generated symbol.`
    );
  } else {
    logger.info(`Zodiac artwork loaded: all ${ZODIAC_SIGNS.length} signs found in ${zodiacDir}`);
  }

  zodiacPathCache = map;
  zodiacDirCached = zodiacDir;
  return map;
}

/**
 * Returns the absolute path to the zodiac artwork PNG for the given sign, or
 * null if that sign's artwork is missing. Caller must fall back gracefully
 * (e.g. to the legacy generated symbol) when null is returned.
 */
export function getZodiacArtPath(sign: string, zodiacDir: string): string | null {
  const key = sign.trim().toLowerCase();
  const map = loadZodiacMap(zodiacDir);
  return map.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Validation (non-throwing -- logs only, used at preflight time)
// ---------------------------------------------------------------------------

/**
 * Validates the asset pack and logs a single summary line. Never throws --
 * missing assets are always non-fatal and handled via fallbacks at render
 * time. Safe to call once at process startup (preflight).
 */
export function validateAssets(backgroundsDir: string, zodiacDir: string): void {
  const backgrounds = loadBackgroundList(backgroundsDir);
  const zodiacMap = loadZodiacMap(zodiacDir);

  logger.info("Asset manager validation summary", {
    backgroundsFound: backgrounds.length,
    zodiacSignsFound: zodiacMap.size,
    zodiacSignsExpected: ZODIAC_SIGNS.length,
  });
}

/** Clears in-memory caches. Exposed for tests only -- not used in production. */
export function _resetAssetCachesForTests(): void {
  backgroundListCache = null;
  backgroundDirCached = null;
  zodiacPathCache = null;
  zodiacDirCached = null;
}
