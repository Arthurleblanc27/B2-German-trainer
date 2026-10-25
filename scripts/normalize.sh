#!/usr/bin/env bash
#
# B2-Trainer — Pipeline audio, langkah 2: normalisasi loudness.
#
# Menormalkan satu berkas audio ke loudness standar siaran (EBU R128)
# memakai ffmpeg loudnorm, mono 44,1 kHz, 96 kbps.
#
# Pemakaian:
#   bash scripts/normalize.sh <input.mp3> [output.mp3]
#
# Bila output dihilangkan, berkas dinormalkan DI TEMPAT (in place): hasil ditulis
# ke berkas sementara lalu mengganti input setelah sukses.
#
# Contoh:
#   bash scripts/normalize.sh public/audio/hoeren-unit-01-teil1.mp3
#   bash scripts/normalize.sh raw.mp3 public/audio/hoeren-unit-01-teil1.mp3
#
set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "GALAT: ffmpeg tidak ditemukan di PATH." >&2
  echo "  Windows : pasang lewat 'winget install Gyan.FFmpeg' atau unduh di https://ffmpeg.org/download.html" >&2
  echo "  macOS   : brew install ffmpeg" >&2
  echo "  Debian  : sudo apt install ffmpeg" >&2
  exit 127
fi

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Pemakaian: bash scripts/normalize.sh <input.mp3> [output.mp3]" >&2
  exit 64
fi

IN="$1"

if [ ! -f "$IN" ]; then
  echo "GALAT: berkas input tidak ditemukan: $IN" >&2
  exit 66
fi

if [ "$#" -eq 2 ]; then
  OUT="$2"
  if [ "$OUT" = "$IN" ]; then
    echo "GALAT: output sama dengan input; hilangkan argumen kedua untuk normalisasi in-place." >&2
    exit 64
  fi
else
  OUT="$IN"
fi

TMP=""
if [ "$OUT" = "$IN" ]; then
  TMP="${IN%.*}.norm.tmp.mp3"
  DEST="$TMP"
else
  DEST="$OUT"
  mkdir -p "$(dirname "$OUT")"
fi

echo "[normalize] ffmpeg loudnorm I=-16 TP=-1.5 LRA=11 · mono 44,1 kHz · 96 kbps"
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -af loudnorm=I=-16:TP=-1.5:LRA=11 \
  -ac 1 -ar 44100 -b:a 96k \
  "$DEST"

if [ "$OUT" = "$IN" ]; then
  mv -f "$TMP" "$IN"
fi

echo "[normalize] selesai: $OUT"
