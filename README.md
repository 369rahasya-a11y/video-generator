# Rahasya Video Generation Engine — V2

Premium luxury astrology video generation for **Discover Rahasya**.

Produces 24-second vertical (1080×1920) MP4 videos for Instagram Reels,
YouTube Shorts, Facebook Reels, and TikTok. Fully automated via GitHub Actions.

---

## What Changed in V2

| Area | V1 | V2 |
|------|----|----|
| Background | Flat colour / static MP4 | 5 premium dark gradient themes |
| Zodiac wheel | Not present | Rotating overlay, full 24 s |
| Scene hook | `reel_hook` | `card_hook` (premium hook) |
| Scene timing | Variable | Fixed: 0–5 / 5–12 / 12–19 / 19–24 s |
| CTA | Single hardcoded text | 12 premium CTAs, randomly selected |
| Music | Single track or none | Folder discovery, random, no repeats |
| Typography | Static font sizes | Dynamic sizing based on text length |
| Branding | Logo centred | DISCOVER / RAHASYA — top-left, all scenes |

---

## Architecture

```
src/
  config/
    env.ts          — All environment variables
    themes.ts       — 5 premium dark themes
    ctas.ts         — 12 CTA templates
  engines/
    backgroundEngine.ts  — Generates & caches theme gradient PNGs
    musicEngine.ts       — Discovers tracks, random selection, fallback
  generators/
    scenePlanner.ts      — Builds VideoPlan (theme, CTA, font sizes, timing)
    videoGenerator.ts    — Orchestrates plan → render → upload → DB insert
  renderers/
    textRenderer.ts      — Builds complete FFmpeg filter_complex
    sceneRenderer.ts     — Assembles FFmpeg args, runs encode
  services/             ← UNCHANGED (Supabase, storage, DB)
  utils/                ← UNCHANGED (fonts, text wrapping, zodiac, retry)
  commands/
    generateVideos.ts   — `npm run generate` (production batch)
    preview.ts          — `npm run preview` (local test, no Supabase)
    testVideo.ts        — `npm run test-video` (1 real row + upload)

assets/
  wheel/zodiac-wheel.png  ← committed to repo (required)
  music/                  ← add .mp3/.ogg files here (optional)
  fonts/                  ← add Display.ttf / Body.ttf here (optional)
```

---

## Video Structure

| Scene | Time | Content |
|-------|------|---------|
| 1 – Hook | 0–5 s | Symbol · Sign · Mood · `card_hook` |
| 2 – Script Part 1 | 5–12 s | First half of `reel_script` |
| 3 – Script Part 2 | 12–19 s | Second half of `reel_script` |
| 4 – CTA | 19–24 s | CTA message · Discover Rahasya · URL |

---

## Setup

### 1. Environment variables

```bash
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

### 2. GitHub Actions secrets

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### 3. Optional GitHub Actions variables

```
SUPABASE_VIDEO_BUCKET  (default: social-videos)
BRAND_NAME             (default: Discover Rahasya)
BRAND_URL              (default: discover-rahasya.vercel.app)
```

---

## Commands

```bash
# Test locally — no Supabase needed
npm run preview
npm run preview -- --sign=cancer --mood=ambitious

# One real row from Supabase → upload → DB
npm run test-video

# Full batch (all pending rows)
npm run generate
npm run generate -- --limit=10
npm run generate -- --sign=pisces

# TypeScript type check
npm run typecheck
```

---

## Adding Music

Place `.mp3` / `.ogg` files in `assets/music/`. The engine discovers them
automatically and picks one randomly per video. See `assets/music/README.md`
for suggested sources.

Without music files the engine synthesises a cosmic ambient drone using
FFmpeg — videos always render successfully.

---

## Adding Custom Fonts

Place `Display.ttf` (bold) and `Body.ttf` (regular) in `assets/fonts/`.
The engine will prefer these over the system DejaVu fallback.

---

## Themes

Five themes are randomly selected per video:

| ID | Name | Centre | Accent |
|----|------|--------|--------|
| midnight-blue | Midnight Blue | #16245E | #7BAED9 |
| royal-purple | Royal Purple | #2A1658 | #B07DD9 |
| deep-burgundy | Deep Burgundy | #481218 | #D97B8A |
| dark-teal | Dark Teal | #0C3A3A | #7DD9C8 |
| charcoal-black | Charcoal Black | #262626 | #D4AF37 |

Add new themes in `src/config/themes.ts` without touching any renderer code.

---

## CTAs

12 CTA templates stored in `src/config/ctas.ts`. Add more without touching
renderer code. One is randomly selected per video.

---

## What Changed in V3 (Marketing AI V2 + Offline Narration)

This upgrade adds offline AI narration and Migration 007 schema support
**without** redesigning the rendering engine, branding, or visual identity.

| Area | V2 | V3 |
|------|----|----|
| Content source | `reel_script` (deprecated) | Six `video_story_*` fields (Migration 007) |
| Scene count | 4 fixed scenes | 6 scenes, one per story field |
| Scene timing | Fixed 0-5 / 5-12 / 12-19 / 19-24s | Derived from measured narration audio |
| Narration | None (music/synthetic drone only) | Offline Piper TTS, per-scene clips |
| Runtime | Fixed 24s | Targets 30s (+/-1s), never cuts story content |
| CTA text | 12 hardcoded templates | `video_story_website_cta` (Marketing AI-authored) |
| CTA symbol | Paired with hardcoded text | Still randomly selected (decorative only) |
| Subtitles | N/A | Each scene's full text is shown exactly while its narration plays |

### New modules

```
src/
  tts/
    ttsProvider.ts       -- TTSProvider interface (provider abstraction)
    piperProvider.ts      -- Piper TTS implementation (offline, no API keys)
  generators/
    narrationBuilder.ts   -- Synthesizes per-scene narration, measures
                             duration, computes tempo/pause to hit 30s (+/-1s),
                             assembles the final narration WAV via ffmpeg.
  utils/
    audioProbe.ts          -- ffprobe-based duration measurement
```

`scenePlanner.ts`, `textRenderer.ts`, and `sceneRenderer.ts` were updated to
support 6 dynamically-timed scenes and to mix narration (foreground) with
ambient music (ducked to ~22% under narration). No branding, fonts, colours,
themes, or CTA symbols were changed.

### Setting up Piper TTS

Piper is a small, fully offline text-to-speech engine. No API key, no
internet dependency at runtime, and it runs comfortably within a GitHub
Actions job.

1. Download a Piper release for your platform from
   https://github.com/rhasspy/piper/releases (Linux/macOS/Windows binaries
   are all published there).
2. Download a voice model, e.g. an English voice `.onnx` + `.onnx.json` pair
   from https://github.com/rhasspy/piper/blob/master/VOICES.md.
3. Set the following environment variables (or use the defaults, which
   expect the binary on `PATH` and the model at `assets/voice/voice.onnx`):

```
PIPER_PATH=/path/to/piper            # or just "piper" if it's on PATH
PIPER_MODEL_PATH=assets/voice/voice.onnx
PIPER_CONFIG_PATH=assets/voice/voice.onnx.json   # optional; Piper can auto-resolve
PIPER_LENGTH_SCALE=1.05              # 1.0 = model default; >1 = slower/calmer
```

In GitHub Actions (Ubuntu runners), download the Linux Piper binary and the
voice model as a workflow step before `npm run generate`, and cache both
between runs to keep the job fast.

### Narration / timing environment variables

```
TARGET_DURATION_SECONDS=30           # target total video runtime
TARGET_DURATION_TOLERANCE_SECONDS=1  # acceptable +/- deviation
BASE_PAUSE_SECONDS=0.45              # baseline pause between story sections
MIN_PAUSE_SECONDS=0.3
MAX_PAUSE_SECONDS=0.6
MIN_TEMPO=0.85                       # narrowest natural speaking-rate adjustment
MAX_TEMPO=1.18                       # widest natural speaking-rate adjustment
CTA_MIN_DURATION_SECONDS=3.5         # CTA scene stays visible at least this long
```

If the narration + pauses can't be brought within tolerance using only
natural tempo/pause adjustment (i.e. the clamps above are hit), the pipeline
logs a warning and keeps the full, unedited story rather than trimming any
content -- exactly as required by the spec.

### Why per-scene narration (not word-level alignment)

Piper does not emit word-level timestamps out of the box. Rather than bolt
on a separate forced-aligner, each of the 6 story fields is synthesized as
its own narration clip. Its measured duration *is* that scene's duration --
so the on-screen text for a scene is, by construction, shown for exactly as
long as its narration plays. This keeps the pipeline simple, fully offline,
and precisely synchronized without adding a new dependency.

---

## What Changed in V4 (Fully Autonomous Daily Pipeline)

The GitHub Actions workflow now runs end-to-end on a brand-new runner with
**zero manual setup** — no pre-installed binaries, no manually uploaded
voice models, no local configuration.

### What was broken

`spawn piper ENOENT` — Piper was never installed in CI. `PIPER_PATH` pointed
at a binary that simply didn't exist on the runner.

### What's automated now

| Step | How |
|------|-----|
| Piper binary | Downloaded from the pinned GitHub release (`scripts/setup-piper.sh`), cached between runs via `actions/cache` |
| Piper voice model (.onnx + .onnx.json) | Downloaded from Hugging Face (`rhasspy/piper-voices`), cached alongside the binary |
| `PIPER_PATH` / `PIPER_MODEL_PATH` / `PIPER_CONFIG_PATH` | Exported automatically into `$GITHUB_ENV` by the setup script — no manual env configuration |
| FFmpeg / FFprobe / fonts | `apt-get install` (unchanged from V1) |
| Dependency verification | `src/utils/preflight.ts` runs in-process before any row is touched — fails fast with one aggregated, human-readable error listing every missing piece |
| "Today's" date | Auto-resolved from the latest non-NULL `horoscope_date` in `marketing_content` — no date input needed for the daily cron |
| Legacy undated rows | Permanently excluded (`horoscope_date IS NOT NULL` is now unconditional in every query) |
| Debug artifacts | Uploaded only `if: failure()` (unchanged) |
| Temp file cleanup | Explicit `if: success()` step, in addition to per-video cleanup that already existed |

### New files

```
scripts/
  setup-piper.sh          -- idempotent Piper binary + voice model installer
src/utils/
  preflight.ts             -- verifies ffmpeg/ffprobe/piper/model/config/fonts
                               before generation starts; throws PreflightError
                               with every problem found, not just the first
  commandCheck.ts           -- spawns a binary to confirm it's actually runnable
```

### Running it yourself (local dev)

```bash
npm run setup:piper      # downloads Piper + voice model, prints export lines
export PIPER_PATH=...    # paste the lines the script prints
export PIPER_MODEL_PATH=...
export PIPER_CONFIG_PATH=...
npm run preview           # or npm run generate
```

In CI this all happens automatically — `scripts/setup-piper.sh` detects it's
running inside GitHub Actions (via `$GITHUB_ENV`) and exports the three
variables for you.

### Batch command changes

```bash
npm run generate                        # auto-resolves latest horoscope_date
npm run generate -- --date=2026-07-10   # explicit date
npm run generate -- --all-dates         # escape hatch: any pending date
```

If no `--date` is passed and `--all-dates` is not set, the batch command
queries `marketing_content` for the latest non-NULL `horoscope_date` and
processes only that day's rows — this is what the scheduled cron run does
every night, with no input required.

### Pinned versions

Piper version, architecture, and voice are pinned in the workflow's `env:`
block (`PIPER_VERSION`, `PIPER_ARCH`, `PIPER_VOICE`) rather than tracking
"latest" — a version bump is a deliberate, visible diff, not a silent
runtime surprise. Update them there (and bump the cache key follows
automatically, since it's derived from the same values).
