# assets/music/

Place royalty-free ambient music tracks here.

## Requirements

- Formats supported: `.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, `.aac`
- Recommended: 5–10 tracks, each at least 30 seconds long
- Must be licensed for commercial use (royalty-free)

## Suggested sources

| Source | License |
|--------|---------|
| [Pixabay Music](https://pixabay.com/music/) | Free commercial use |
| [Free Music Archive](https://freemusicarchive.org/) | Various CC licenses |
| [ccMixter](http://ccmixter.org/) | Creative Commons |
| [Bensound](https://www.bensound.com/) | Free with attribution |

## Recommended style

Look for tracks tagged with: `ambient`, `meditation`, `cosmic`, `mystical`, `cinematic`, `dark atmospheric`

## Naming convention

```
ambient01.mp3
ambient02.mp3
...
ambient10.mp3
```

Any filename works — the engine discovers all audio files in this folder automatically.

## Fallback

If no music files are present, the engine automatically synthesises a
multi-harmonic ambient drone (136.1 Hz / OM frequency) using FFmpeg's
audio filter graph. The video will always render successfully.

## Volume

All tracks are automatically normalised to 0.65 gain with 1.5-second
fade-in and fade-out. No manual editing required.
