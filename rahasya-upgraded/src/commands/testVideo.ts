/**
 * testVideo.ts  — `npm run test-video`
 *
 * Fetches exactly ONE real row from marketing_content, generates a video,
 * uploads it to Supabase Storage, and inserts into social_videos — then stops.
 *
 * Use this to verify the full pipeline end-to-end with real data before
 * running `npm run generate` for the full batch.
 *
 * This is equivalent to `npm run generate -- --limit=1` but kept as a
 * separate entry point for clarity in developer documentation.
 *
 * Optional filters:
 *   npm run test-video -- --sign=cancer --mood=ambitious
 */

import * as dotenv from "dotenv";
dotenv.config();

// Simply re-uses generateVideos.ts with --limit=1 injected.
// We inject the flag before yargs parses so the behaviour is identical.
process.argv.push("--limit=1");

// Hand off to the main generate command.
import "./generateVideos";
