import * as fs from "fs";
import * as path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Derives the storage object path for a video.
 *
 * Pattern: `YYYY-MM-DD/sign-mood.mp4`
 * Example: `2026-06-21/aries-peaceful.mp4`
 *
 * If horoscope_date is null the current UTC date is used as a fallback.
 */
function buildStoragePath(
  sign: string,
  mood: string,
  horoscopeDate: string | null
): string {
  const dateStr =
    horoscopeDate ??
    new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const slug = (v: string) =>
    v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  return `${dateStr}/${slug(sign)}-${slug(mood)}.mp4`;
}

/**
 * Uploads a local MP4 to Supabase Storage and returns its public URL.
 *
 * - Uses `upsert: true` so re-running the pipeline for the same sign/mood/date
 *   overwrites the existing file instead of erroring (idempotent).
 * - The bucket must be set to public in Supabase (created by the SQL migration
 *   or via the dashboard).
 */
export async function uploadVideo(
  supabase: SupabaseClient,
  localPath: string,
  sign: string,
  mood: string,
  horoscopeDate: string | null,
  config: AppConfig
): Promise<string> {
  const storagePath = buildStoragePath(sign, mood, horoscopeDate);
  const bucket = config.supabaseVideoBucket;

  logger.info("Uploading video to Supabase Storage", {
    bucket,
    storagePath,
    localPath,
  });

  const fileBuffer = fs.readFileSync(localPath);
  const fileSizeKB = Math.round(fileBuffer.byteLength / 1024);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Supabase Storage upload failed for ${storagePath}: ${error.message}`
    );
  }

  // Build the public URL.
  // Supabase public URL format:
  //   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  if (!publicUrl) {
    throw new Error(
      `getPublicUrl returned an empty URL for ${storagePath}. ` +
        `Check that the bucket "${bucket}" exists and is set to public.`
    );
  }

  logger.info("Upload complete", {
    storagePath,
    publicUrl,
    fileSizeKB,
  });

  return publicUrl;
}
