/**
 * Mirrors the `marketing_content` table. This repository only ever READS
 * this table — never writes to it. Columns beyond the ones we actively
 * use are kept optional/typed loosely since other repos own that schema.
 */
export interface MarketingContentRow {
  id: number;
  marketing_horoscope_id: number | null;
  sign: string;
  mood: string;
  card_text: string | null;
  reel_hook: string;
  reel_script: string;
  caption: string | null;
  created_at: string;
  card_hook: string | null;
  horoscope_date: string | null;
}

export interface MarketingContentFilter {
  sign?: string;
  mood?: string;
  limit?: number;
  /** When false (default), rows that already have a social_videos entry are skipped. */
  force?: boolean;
}
