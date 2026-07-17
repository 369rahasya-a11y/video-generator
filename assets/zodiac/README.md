# assets/zodiac/

Per-sign zodiac artwork, one transparent PNG per sign:

```
aries.png       taurus.png      gemini.png      cancer.png
leo.png         virgo.png       libra.png       scorpio.png
sagittarius.png capricorn.png   aquarius.png    pisces.png
```

This replaces the previously programmatically-drawn zodiac symbol (a
Unicode glyph rendered via `drawtext`) in the hook scene. The image is
looked up by sign via `src/assets/assetManager.ts` and scaled
proportionally (never stretched/distorted), preserving transparency.

## Adding / replacing artwork

Filenames must exactly match the lowercase sign name (e.g. `aries.png`).
Any file must have an alpha channel (RGBA) for correct compositing over
the background.

## Fallback

If a given sign's artwork is missing, that video falls back to the
original generated Unicode symbol for the hook scene — rendering never
crashes because of a missing asset. A warning is logged so the gap can be
noticed and fixed.
