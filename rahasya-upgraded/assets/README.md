# Assets

Place production asset files in this directory. None are required to run the
pipeline — the system degrades gracefully with synthetic placeholders so you
can develop and preview locally without any binary files.

---

## `background.mp4` — Cosmic background loop

| Property | Requirement |
|----------|-------------|
| Resolution | 1080 × 1920 (9:16 vertical) |
| Duration | 15–60 seconds (will be looped) |
| Frame rate | 24 fps or 30 fps |
| Content | Dark cosmic: stars, nebula, slow particle movement |
| Audio | **None** — video-only, or mute the track before adding here |
| Licence | Royalty-free, commercial use permitted |

**Suggested sources:**
- [Pexels](https://www.pexels.com/videos/) — search "dark space stars loop"
- [Pixabay](https://pixabay.com/videos/) — search "cosmic background vertical"
- [Coverr](https://coverr.co) — search "space nebula"
- [Mixkit](https://mixkit.co/free-stock-video/space/) — space collection

**Without this file:** the pipeline uses a synthetic dark navy (#080C1F)
background with subtle temporal noise. Functional for testing, but not
the premium Rahasya aesthetic for production.

---

## `music.mp3` — Ambient background track

| Property | Requirement |
|----------|-------------|
| Duration | 30–120 seconds (will be looped seamlessly) |
| Genre | Ambient / cosmic / meditative |
| BPM | Slow: 60–80 BPM preferred |
| Vocals | **None** |
| Licence | Royalty-free, commercial use, no attribution required |

**Suggested sources:**
- [Pixabay Music](https://pixabay.com/music/search/meditation/) — free, no attribution
- [Free Music Archive](https://freemusicarchive.org) — search "ambient meditation"
- [Uppbeat](https://uppbeat.io) — "cosmic" or "meditation" category (free tier)
- [Artlist.io](https://artlist.io) — premium, all-in-one licence

**Tips for a loop-friendly track:**
- Choose a track that starts and ends quietly (easy to loop without a click)
- Avoid tracks with distinct drum patterns that make the loop point obvious
- 60–90 second duration loops naturally over a 15–20 second video

**Without this file:** the pipeline uses a silent audio track. Videos render
correctly but have no background music.

---

## `fonts/` — Custom brand typography (optional)

Drop TrueType font files here to use custom brand fonts in videos:

| File | Used for |
|------|----------|
| `Display.ttf` | Zodiac symbol · Sign name · Brand wordmark (bold) |
| `Body.ttf` | Hook text · Script text · Tagline · URL (regular) |

**Without these files:** the pipeline automatically falls back to
**DejaVu Sans Bold** and **DejaVu Sans**, which are installed on the
GitHub Actions runner via `apt-get install fonts-dejavu-core`.

DejaVu Sans has full Unicode coverage including:
- All 12 zodiac symbols (♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓)
- The crescent moon symbol (☽)

---

## Asset checklist for production

```
assets/
  background.mp4    ← cosmic background loop (recommended)
  music.mp3         ← ambient track (recommended)
  fonts/
    Display.ttf     ← brand bold font (optional)
    Body.ttf        ← brand regular font (optional)
```

None of these files should be committed to Git. Add them to `.gitignore`
(already done for `assets/*.mp4` and `assets/*.mp3`) and download them in
your CI workflow from a private S3 bucket, GitHub LFS, or similar.
