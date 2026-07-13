/**
 * Text utilities for the FFmpeg drawtext pipeline.
 * Pure TypeScript — no native dependencies.
 */

/**
 * Wraps `text` into lines that fit within `maxCharsPerLine`.
 * Returns an array of line strings.
 *
 * We can't use a real font renderer server-side (no canvas), so this uses an
 * average character width estimate that is conservative enough to prevent
 * overflow for latin text in DejaVu Sans at any reasonable font size.
 *
 * The caller writes the resulting lines to a textfile for FFmpeg drawtext.
 */
export function wrapLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Wraps text and joins lines with real newlines so the string can be
 * written directly to a textfile read by FFmpeg drawtext.
 */
export function wrapTextForFile(text: string, maxCharsPerLine: number): string {
  return wrapLines(text, maxCharsPerLine).join("\n");
}

/**
 * Returns the max characters per line for a given font size on a 1080px canvas
 * with 80px side padding (920px usable).
 *
 * Uses DejaVu Sans average char width ≈ 0.57 × fontSize.
 * Values are intentionally conservative to handle uppercase-heavy lines.
 */
export function maxCharsForFontSize(fontSize: number): number {
  const usableWidth = 920;
  const avgCharWidth = fontSize * 0.57;
  return Math.floor(usableWidth / avgCharWidth);
}
