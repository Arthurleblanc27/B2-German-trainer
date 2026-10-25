#!/usr/bin/env python3
"""
B2-Trainer — Pipeline audio, langkah 3: forced alignment (timestamp kata).

Menjalankan forced alignment transkrip terhadap audio yang sudah diproduksi
(public/audio/<teilId>.mp3) untuk menghasilkan word timestamps
[[start, end, wort], ...] per Teil, lalu menuliskannya kembali ke
audio.wort_timestamps di berkas JSON item. Dengan ini transkrip bisa diklik
per kata di player.

Mendukung tiga sumber:
  * unit Hören B2          (src/content/hoeren/unit-*.json)      --unit N
  * modelltest B2 (Hören)  (src/content/modelltest/*.json)       --pruefung ID
  * modul TestDaF (Hören)  (src/content-testdaf/mt*/hoeren-*.json)  --testdaf [--mt 01]

Mesin: faster-whisper (model Whisper Jerman) sebagai jalur utama —
memberi word timestamps langsung lewat transkripsi. Bila faster-whisper tersedia,
word timestamp dihitung dari transkripsi audio aktual (bukan dari teks), sehingga
sinkron dengan audio nyata. Jalur whisperX (wav2vec2 Jerman) bersifat opsional.

Pemakaian:
    python3 scripts/align.py [--unit N] [--pruefung ID] [--testdaf [--mt NN]] [--model base] [--force]

Contoh:
    python3 scripts/align.py --unit 1
    python3 scripts/align.py --pruefung pruefung-01
    python3 scripts/align.py --testdaf            # semua tugas Hören TestDaF
    python3 scripts/align.py --testdaf --mt 01    # hanya Modelltest 1
    python3 scripts/align.py --model medium --force

Bila library/model belum terpasang, skrip ini berhenti dengan pesan instalasi
yang jelas (tidak berpura-pura berhasil menjalankan alignment).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "src" / "content" / "hoeren"
MODELLTEST_DIR = ROOT / "src" / "content" / "modelltest"
TESTDAF_DIR = ROOT / "src" / "content-testdaf"
AUDIO_DIR = ROOT / "public" / "audio"

# Nama model Whisper yang dianggap grup "Jerman" (default) untuk pesan bantuan.
GERMAN_MODELS = ("tiny", "base", "small", "medium", "large-v3")

INSTALL_HINT = """\
[align] GALAT: mesin alignment belum terpasang.

  Opsi A — faster-whisper (jalur utama, CPU/GPU):
      uv pip install --system faster-whisper
      # atau:  pip install --user faster-whisper
  Model diunduh otomatis saat pertama kali dijalankan (butuh internet).

  Opsi B — whisperX (wav2vec2 Jerman, alignment kata lebih presisi):
      uv pip install --system whisperx
      # atau:  pip install --user whisperx

  Setelah terpasang, jalankan lagi:
      python3 scripts/align.py --unit <N> [--model de] [--force]
"""


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_preserving(path: Path, data) -> None:
    """Tulis JSON menjaga urutan kunci, indentasi 2 spasi, dan CRLF/LF asli."""
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    trailing = raw.endswith(b"\n")
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if trailing:
        text += "\n"
    if crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))


def teil_liste(data):
    """Teile-Liste einer Datei: Hören-Units nutzen 'teile', der Modelltest 'hoeren'."""
    return data.get("teile") or data.get("hoeren") or []


def find_files(unit: int | None, pruefung: str | None = None,
               testdaf: bool = False, mt: str | None = None):
    """[(Pfad, art)] — 'hoeren' | 'pruefung' | 'testdaf'."""
    if testdaf:
        files = sorted(TESTDAF_DIR.glob("mt*/hoeren-aufgabe-*.json"))
        if mt:
            tag = f"mt{int(mt):02d}"
            files = [f for f in files if tag in f.as_posix().lower()]
        return [(f, "testdaf") for f in files]
    if pruefung:
        p = MODELLTEST_DIR / f"{pruefung}.json"
        if not p.exists():
            print(f"[align] Modelltest '{pruefung}' nicht gefunden: {p.as_posix()}", file=sys.stderr)
            return []
        return [(p, "pruefung")]
    files = sorted(CONTENT_DIR.glob("unit-*.json"))
    if unit is not None:
        files = [f for f in files if re.search(rf"unit-0*{unit}\.json$", f.name)]
    return [(f, "hoeren") for f in files]


def _clean_wort(text: str) -> str:
    """Buang spasi & tanda baca pinggir agar token sama seperti di transkrip."""
    return text.strip().strip(".,!?;:»«„“”\"'()[]")


def _decode_ffmpeg(path: Path):
    """Dekode audio apa pun -> numpy float32 mono 16 kHz via ffmpeg.

    Menghindari kuirkompatibilitas PyAV (`av.open(..., metadata_errors=...)`
    dihapus pada av>=19) sekaligus membuat alignment tidak bergantung codec.
    """
    import numpy as np  # noqa: WPS433  (disertakan oleh faster-whisper)

    out = subprocess.check_output(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
            "-f", "f32le", "-ac", "1", "-ar", "16000", "-acodec", "pcm_f32le", "pipe:1",
        ]
    )
    return np.frombuffer(out, dtype=np.float32)


def build_aligner(model: str):
    """Kembalikan (nama_modul, fungsi_align). Fungsi_align(path) -> list[token]."""
    try:
        from faster_whisper import WhisperModel  # noqa: WPS433

        # 'de' bukan nama model faster-whisper; pakai ukuran model.
        whisper_size = model if model in GERMAN_MODELS else "small"

        def _align_fw(audio_path: Path):
            audio = _decode_ffmpeg(audio_path)
            model_obj = WhisperModel(whisper_size, device="auto", compute_type="int8")
            segments, _info = model_obj.transcribe(
                audio, language="de", word_timestamps=True
            )
            tokens = []
            for seg in segments:
                for w in (seg.words or []):
                    wort = _clean_wort(w.word)
                    if wort:
                        tokens.append([round(float(w.start), 3), round(float(w.end), 3), wort])
            return tokens

        return "faster-whisper", _align_fw
    except ImportError:
        pass

    try:
        import whisperx  # noqa: WPS433

        def _align_wx(audio_path: Path):
            import torch

            device = "cuda" if torch.cuda.is_available() else "cpu"
            amodel = whisperx.load_model("small", device, language="de")
            audio = whisperx.load_audio(str(audio_path))
            result = amodel.transcribe(audio, language="de")
            align_model, meta = whisperx.load_align_model(language_code="de", device=device)
            aligned = whisperx.align(result["segments"], align_model, meta, audio, device)
            tokens = []
            for seg in aligned.get("segments", []):
                for w in (seg.get("words") or []):
                    if "start" not in w or "end" not in w:
                        continue
                    wort = _clean_wort(w.get("word", ""))
                    if wort:
                        tokens.append([round(float(w["start"]), 3), round(float(w["end"]), 3), wort])
            return tokens

        return "whisperx", _align_wx
    except ImportError:
        pass

    return None, None


def _mp3_for(audio: dict, kennung: str) -> Path | None:
    """Datei zur Audio-Angabe: bevorzugt audio.src (autoritativ), sonst <id>.mp3."""
    src = (audio.get("src") or "").strip()
    kandidaten = []
    if src:
        kandidaten.append(AUDIO_DIR / Path(src).name)
    kandidaten.append(AUDIO_DIR / f"{kennung}.mp3")
    for k in kandidaten:
        if k.exists():
            return k
    return kandidaten[0]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="align.py",
        description="Forced alignment transkrip Hören -> word timestamps per kata.",
    )
    ap.add_argument("--unit", type=int, default=None, metavar="N",
                    help="hanya proses unit N (mis. --unit 1)")
    ap.add_argument("--pruefung", default=None, metavar="ID",
                    help="proses bagian Hören eines Model tests (mis. --pruefung pruefung-01)")
    ap.add_argument("--testdaf", action="store_true",
                    help="proses semua tugas Hören modul TestDaF (src/content-testdaf/mt*/hoeren-*.json)")
    ap.add_argument("--mt", default=None, metavar="NN",
                    help="batasi --testdaf ke satu Modelltest (mis. --mt 01)")
    ap.add_argument("--model", default="de", metavar="de",
                    help="bahasa/model alignment (default 'de'; ukuran model: "
                         + "/".join(GERMAN_MODELS) + ")")
    ap.add_argument("--force", action="store_true",
                    help="tulis ulang walau wort_timestamps sudah terisi")
    args = ap.parse_args(argv)

    dateien = find_files(args.unit, args.pruefung, args.testdaf, args.mt)
    if not dateien:
        print("[align] tidak ada Teil Hören yang cocok (--unit / --pruefung / --testdaf)",
              file=sys.stderr)
        return 1

    engine, align_fn = build_aligner(args.model)
    if engine is None:
        print(INSTALL_HINT, file=sys.stderr)
        return 2

    # Kumpulkan Teil yang perlu diproses (punya audio + mp3 nyata).
    jobs = []
    for f, art in dateien:
        data = load_json(f)
        if art == "testdaf":
            # TestDaF: die Datei IST die Aufgabe (id + audio direkt im Wurzelobjekt).
            audio = data.get("audio")
            if not audio:
                continue
            kennung = data.get("id") or f.stem
            if audio.get("wort_timestamps") and not args.force:
                print(f"  = {kennung}: wort_timestamps sudah ada "
                      f"({len(audio['wort_timestamps'])} kata) — lewati (pakai --force)")
                continue
            mp3 = _mp3_for(audio, kennung)
            if not mp3.exists():
                print(f"  x {kennung}: mp3 belum ada ({mp3.as_posix()}) — "
                      f"jalankan scripts/tts_testdaf.py dulu", file=sys.stderr)
                continue
            jobs.append((f, data, audio, kennung, mp3))
            continue
        for teil in teil_liste(data):
            audio = teil.get("audio")
            if not audio:
                continue
            if audio.get("wort_timestamps") and not args.force:
                print(f"  = {teil['id']}: wort_timestamps sudah ada "
                      f"({len(audio['wort_timestamps'])} kata) — lewati (pakai --force)")
                continue
            mp3 = _mp3_for(audio, teil["id"])
            if not mp3.exists():
                print(f"  x {teil['id']}: mp3 belum ada ({mp3.as_posix()}) — "
                      f"jalankan scripts/tts.py dulu", file=sys.stderr)
                continue
            jobs.append((f, data, audio, teil["id"], mp3))

    if not jobs:
        print("[align] tidak ada Teil yang diproses.")
        return 0

    print(f"[align] mesin: {engine} · model: {args.model} · {len(jobs)} Teil")
    fehler = 0
    for f, data, audio, teil_id, mp3 in jobs:
        print(f"  ... {teil_id}: alignment {mp3.name}", flush=True)
        try:
            tokens = align_fn(mp3)
        except Exception as exc:  # noqa: BLE001
            print(f"  x {teil_id}: alignment GAGAL: {exc}", file=sys.stderr)
            fehler += 1
            continue
        if not tokens:
            print(f"  x {teil_id}: tidak ada word timestamp dihasilkan", file=sys.stderr)
            fehler += 1
            continue
        audio["wort_timestamps"] = tokens
        write_json_preserving(f, data)
        print(f"  + {teil_id}: {len(tokens)} kata ditulis ke wort_timestamps")

    print(f"[align] selesai ({fehler} gagal).")
    return 0 if fehler == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
