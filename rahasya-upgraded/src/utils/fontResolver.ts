import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

export interface ResolvedFonts {
  /** Bold font — used for zodiac symbol, sign name, brand wordmark. */
  bold: string;
  /** Regular font — used for hook body, script body, tagline. */
  regular: string;
}

/**
 * Candidate paths in preference order.
 * 1. Project-local assets/fonts/ (custom brand fonts)
 * 2. GitHub Actions / Ubuntu system DejaVu fonts (always installed via
 *    `apt-get install fonts-dejavu-core` in the workflow)
 * 3. FreeFonts fallback
 */
const BOLD_CANDIDATES: string[] = [
  // Custom brand fonts (committed to repo or downloaded in CI)
  path.resolve("assets/fonts/Display.ttf"),
  // GitHub Actions ubuntu-latest + `apt-get install fonts-dejavu-core`
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Bold.ttf",
  // FreeFonts (installed via fonts-freefont-ttf)
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
  // macOS developer machine
  "/Library/Fonts/Arial Bold.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
];

const REGULAR_CANDIDATES: string[] = [
  path.resolve("assets/fonts/Body.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
  "/Library/Fonts/Arial.ttf",
];

function findFirst(candidates: string[], role: string): string {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        logger.info(`Font resolved: ${role} → ${candidate}`);
        return candidate;
      }
    } catch {
      // existsSync can throw on permission errors — keep trying
    }
  }
  throw new Error(
    `No ${role} font found. Install fonts-dejavu-core (Linux) or add ` +
      `assets/fonts/Display.ttf / Body.ttf to the repository.\n` +
      `Searched:\n  ${candidates.join("\n  ")}`
  );
}

export function resolveFonts(): ResolvedFonts {
  return {
    bold: findFirst(BOLD_CANDIDATES, "bold"),
    regular: findFirst(REGULAR_CANDIDATES, "regular"),
  };
}
