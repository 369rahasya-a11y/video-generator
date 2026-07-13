/**
 * ttsProvider.ts
 *
 * Provider abstraction for offline narration generation.
 *
 * The rendering pipeline (narrationBuilder, sceneRenderer) depends only on
 * this interface — never on Piper directly. This allows a future TTS engine
 * to be swapped in by implementing TTSProvider, with zero changes to the
 * renderer or scene planner.
 */

export interface TTSSynthesizeOptions {
  /**
   * Speaking-rate multiplier passed through to the provider.
   * 1.0 = provider default pace. Providers should map this onto whatever
   * native "length scale" / "rate" control they expose.
   */
  lengthScale?: number;
}

export interface TTSSynthesizeResult {
  /** Absolute path to the generated audio file (WAV). */
  outputPath: string;
  /** Duration of the generated audio, in seconds. */
  durationSeconds: number;
}

export interface TTSProvider {
  /** Human-readable name, used in logs. */
  readonly name: string;

  /**
   * Synthesizes `text` to a WAV file at `outputPath`.
   * Must be fully offline — no network calls, no API keys.
   */
  synthesize(
    text: string,
    outputPath: string,
    options?: TTSSynthesizeOptions
  ): Promise<TTSSynthesizeResult>;
}
