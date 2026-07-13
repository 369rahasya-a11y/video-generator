#!/usr/bin/env bash
#
# setup-piper.sh
#
# Fully automated, idempotent installer for offline Piper TTS + a voice
# model, designed to run unattended on a fresh GitHub Actions runner (or any
# Ubuntu/Debian x86_64 machine) with zero manual steps.
#
# What it does:
#   1. Downloads the Piper binary release (self-contained, no system deps
#      beyond glibc/libstdc++, which ubuntu-latest always has) and extracts
#      it to PIPER_INSTALL_DIR.
#   2. Downloads the requested voice's .onnx + .onnx.json pair to
#      PIPER_VOICE_DIR, if not already present.
#   3. Verifies the binary runs and the voice files are non-empty.
#   4. Exports PIPER_PATH / PIPER_MODEL_PATH / PIPER_CONFIG_PATH:
#        - to $GITHUB_ENV when running inside GitHub Actions, so subsequent
#          workflow steps see them automatically.
#        - otherwise prints `export` lines to stdout for local use.
#
# Safe to re-run: every step is skipped if its output already exists, so
# this doubles as a warm-cache no-op on repeated CI runs (combine with
# actions/cache for near-instant subsequent runs).
#
# Configuration (env vars, all optional):
#   PIPER_VERSION      Piper release tag              (default: v1.2.0)
#   PIPER_ARCH         amd64 | arm64 | armv7           (default: amd64)
#   PIPER_VOICE        Voice model id                  (default: en_US-lessac-medium)
#   PIPER_INSTALL_DIR  Where to extract the binary      (default: <repo>/.piper-bin)
#   PIPER_VOICE_DIR    Where to store the voice model    (default: <repo>/assets/voice)
#
set -euo pipefail

PIPER_VERSION="${PIPER_VERSION:-v1.2.0}"
PIPER_ARCH="${PIPER_ARCH:-amd64}"
PIPER_VOICE="${PIPER_VOICE:-en_US-lessac-medium}"
PIPER_INSTALL_DIR="${PIPER_INSTALL_DIR:-$(pwd)/.piper-bin}"
PIPER_VOICE_DIR="${PIPER_VOICE_DIR:-$(pwd)/assets/voice}"

log()  { echo "[setup-piper] $*"; }
fail() { echo "[setup-piper] ERROR: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required but not found on PATH."
command -v tar  >/dev/null 2>&1 || fail "tar is required but not found on PATH."

mkdir -p "$PIPER_INSTALL_DIR" "$PIPER_VOICE_DIR"

# ── 1. Piper binary ──────────────────────────────────────────────────────────
PIPER_BIN="$PIPER_INSTALL_DIR/piper/piper"

if [ -x "$PIPER_BIN" ]; then
  log "Piper binary already installed at $PIPER_BIN — skipping download."
else
  PIPER_TARBALL_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_${PIPER_ARCH}.tar.gz"
  log "Downloading Piper ${PIPER_VERSION} (${PIPER_ARCH}) from $PIPER_TARBALL_URL"

  TMP_TARBALL="$(mktemp -t piper-XXXXXX.tar.gz)"
  if ! curl -fL --retry 3 --retry-delay 2 -o "$TMP_TARBALL" "$PIPER_TARBALL_URL"; then
    rm -f "$TMP_TARBALL"
    fail "Failed to download Piper from $PIPER_TARBALL_URL. Check PIPER_VERSION/PIPER_ARCH, or GitHub availability."
  fi

  log "Extracting Piper to $PIPER_INSTALL_DIR"
  mkdir -p "$PIPER_INSTALL_DIR/piper"
  tar -xzf "$TMP_TARBALL" -C "$PIPER_INSTALL_DIR/piper" --strip-components=1
  rm -f "$TMP_TARBALL"

  [ -x "$PIPER_BIN" ] || fail "Extraction completed but $PIPER_BIN is not present/executable."
fi

log "Verifying Piper binary runs…"
if ! "$PIPER_BIN" --help >/dev/null 2>&1; then
  fail "$PIPER_BIN failed to run. It may be built for a different architecture " \
       "than this runner, or missing shared libraries (should be self-contained)."
fi
log "Piper binary OK: $PIPER_BIN"

# ── 2. Voice model (.onnx + .onnx.json) ──────────────────────────────────────
# Voice models are hosted on Hugging Face under rhasspy/piper-voices, using
# the path convention: <lang>/<lang_region>/<name>/<quality>/<voice_id>.onnx
# e.g. en_US-lessac-medium -> en/en_US/lessac/medium/en_US-lessac-medium.onnx
IFS='-' read -r LANG_REGION VOICE_NAME VOICE_QUALITY <<< "$PIPER_VOICE"
LANG_FAMILY="${LANG_REGION%%_*}"

HF_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/${LANG_FAMILY}/${LANG_REGION}/${VOICE_NAME}/${VOICE_QUALITY}"
MODEL_PATH="$PIPER_VOICE_DIR/${PIPER_VOICE}.onnx"
CONFIG_PATH="$PIPER_VOICE_DIR/${PIPER_VOICE}.onnx.json"

download_if_missing() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then
    log "Already present: $dest — skipping download."
    return
  fi
  log "Downloading $(basename "$dest") from $url"
  if ! curl -fL --retry 3 --retry-delay 2 -o "$dest.tmp" "$url"; then
    rm -f "$dest.tmp"
    fail "Failed to download $url. Check PIPER_VOICE=\"$PIPER_VOICE\" is a valid " \
         "voice id from https://github.com/rhasspy/piper/blob/master/VOICES.md"
  fi
  mv "$dest.tmp" "$dest"
}

download_if_missing "${HF_BASE}/${PIPER_VOICE}.onnx"      "$MODEL_PATH"
download_if_missing "${HF_BASE}/${PIPER_VOICE}.onnx.json" "$CONFIG_PATH"

[ -s "$MODEL_PATH" ]  || fail "$MODEL_PATH is missing or empty after download."
[ -s "$CONFIG_PATH" ] || fail "$CONFIG_PATH is missing or empty after download."

log "Voice model OK: $MODEL_PATH"
log "Voice config OK: $CONFIG_PATH"

# ── 3. Export resolved paths ─────────────────────────────────────────────────
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "PIPER_PATH=$PIPER_BIN"
    echo "PIPER_MODEL_PATH=$MODEL_PATH"
    echo "PIPER_CONFIG_PATH=$CONFIG_PATH"
  } >> "$GITHUB_ENV"
  log "Exported PIPER_PATH / PIPER_MODEL_PATH / PIPER_CONFIG_PATH to \$GITHUB_ENV"
else
  echo ""
  echo "# Piper is ready. For a local shell, run:"
  echo "export PIPER_PATH=\"$PIPER_BIN\""
  echo "export PIPER_MODEL_PATH=\"$MODEL_PATH\""
  echo "export PIPER_CONFIG_PATH=\"$CONFIG_PATH\""
fi

log "Piper setup complete."
