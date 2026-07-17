# assets/backgrounds/

Production background images, used as the video's base layer instead of
the procedurally generated gradient.

## Rotation

Backgrounds are used in **fixed sequential rotation**, keyed off each
video's stable `marketing_content` row id (never randomised):

```
Video 1 -> Background 1
Video 2 -> Background 2
...
Video N -> Background N
Video N+1 -> Background 1   (cycle repeats forever)
```

The rotation order is the alphabetical filename order in this directory
(see `src/assets/assetManager.ts`). Renaming a file changes its position
in the rotation.

## Adding / replacing backgrounds

Drop any `.png` / `.jpg` / `.jpeg` / `.webp` image in this folder. Images
do not need to be pre-cropped to 1080×1920 — the renderer scales to cover
and centre-crops automatically, so no stretching or distortion occurs
regardless of the source aspect ratio.

## Fallback

If this directory is missing or empty, rendering automatically falls back
to the original procedural gradient background (see
`src/engines/backgroundEngine.ts`) — the pipeline never crashes because of
a missing asset pack.
