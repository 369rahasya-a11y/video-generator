import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../config/env";

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client using the service role key.
 * The service role key is required because this worker reads marketing_content,
 * writes social_videos, and uploads to storage — all of which need elevated
 * privileges (Row Level Security bypassed for server-side operations).
 */
export function getSupabaseClient(config: AppConfig): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
