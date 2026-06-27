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
