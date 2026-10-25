#!/usr/bin/env python3
"""
B2-Trainer — Pipeline audio, langkah 1: TTS (text-to-speech).

Membaca src/content/hoeren/unit-*.json, mengambil audio.transcript, memecahnya
per blok pembicara (penanda "SPRECHER A:" / "SPRECHER B:" / ...), menyintesis
tiap blok dengan edge-tts memakai pemetaan suara per pembicara, menyisipkan jeda
~400 ms antar blok, lalu menulis hasil ke public/audio/<teilId>.mp3.

Durasi nyata hasil (diukur dengan ffprobe) ditulis kembali ke audio.dauer_sekunden
di berkas JSON item yang bersangkutan.

Angka & singkatan Jerman dinormalkan ke bentuk baca SEBELUM sintesis (tabel kecil),
setiap penggantian dilog ke stderr.

Pemakaian:
    python3 scripts/tts.py [--unit N] [--voice-a NAME] [--voice-b NAME]
                           [--rate +0%] [--force] [--dry-run]

Contoh:
    python3 scripts/tts.py --unit 1 --dry-run
    python3 scripts/tts.py --unit 1
    python3 scripts/tts.py --voice-a de-AT-IngridNeural --voice-b de-CH-JanNeural

Lisensi: audio yang dihasilkan adalah karya sendiri (source_type "own").
JANGAN pernah mengunduh atau menyajikan ulang audio DW / Goethe.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --------------------------------------------------------------------------- #
# Konstanta
# --------------------------------------------------------------------------- #

DEFAULT_VOICE_A = "de-DE-KatjaNeural"
DEFAULT_VOICE_B = "de-DE-ConradNeural"
PAUSE_MS = 400  # jeda antar blok pembicara

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "src" / "content" / "hoeren"
MODELLTEST_DIR = ROOT / "src" / "content" / "modelltest"
AUDIO_DIR = ROOT / "public" / "audio"

SPEAKER_RE = re.compile(r"^(SPRECHER\s+([A-Z]))\s*:\s*(.*)$")
TEXT_MARKER_RE = re.compile(r"^TEXT\s+\d+\s*$")

# Pemetaan pembicara -> suara. Hanya dua suara tersedia lewat CLI; pembicara
# tambahan (C, D pada Teil 2/3) bergantian memakai suara A/B.
SPEAKER_TO_SLOT = {"A": "a", "B": "b", "C": "a", "D": "b"}

# --------------------------------------------------------------------------- #
# Util berkas & proses
# --------------------------------------------------------------------------- #


def have(binary: str) -> bool:
    return shutil.which(binary) is not None


def ffprobe_duration(path: Path) -> float:
    """Durasi nyata sebuah berkas audio via ffprobe (detik, float)."""
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_preserving(path: Path, data) -> None:
    """Tulis JSON dengan urutan kunci & indentasi 2 spasi, mempertahankan
    CRLF/LF dan ada/tidaknya newline akhir seperti berkas asli."""
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    trailing = raw.endswith(b"\n")
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if trailing:
        text += "\n"
    if crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))


# --------------------------------------------------------------------------- #
# Normalisasi angka & singkatan Jerman
# --------------------------------------------------------------------------- #

_ONES = [
    "null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht",
    "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn",
    "sechzehn", "siebzehn", "achtzehn", "neunzehn",
]
_TENS = {
    20: "zwanzig", 30: "dreißig", 40: "vierzig", 50: "fünfzig",
    60: "sechzig", 70: "siebzig", 80: "achtzig", 90: "neunzig",
}


def _unter100(n: int) -> str:
    if n < 20:
        return _ONES[n]
    z, e = (n // 10) * 10, n % 10
    if e == 0:
        return _TENS[z]
    ein = "ein" if e == 1 else _ONES[e]
    return f"{ein}und{_TENS[z]}"


def _unter1000(n: int) -> str:
    if n < 100:
        return _unter100(n)
    h, r = n // 100, n % 100
    hs = ("ein" if h == 1 else _ONES[h]) + "hundert"
    return hs + (_unter100(r) if r else "")


def zahl_zu_wort(n: int) -> str:
    """Kardinalzahl Jerman. 2026 -> 'zweitausendsechsundzwanzig'."""
    if n < 0:
        return "minus " + zahl_zu_wort(-n)
    if n == 0:
        return "null"
    if n >= 1_000_000:
        m, r = divmod(n, 1_000_000)
        s = "eine Million" if m == 1 else f"{zahl_zu_wort(m)} Millionen"
        if r:
            s += " " + zahl_zu_wort(r)
        return s
    if n >= 1000:
        t, r = divmod(n, 1000)
        s = "eintausend" if t == 1 else f"{zahl_zu_wort(t)}tausend"
        if r:
            s += zahl_zu_wort(r)
        return s
    return _unter1000(n)


def _jahr_zu_wort(n: int) -> str:
    """Tahun 1100–1999 dibaca 'neunzehnhundertneunzig'; 2000+ memakai kardinal."""
    if 1100 <= n <= 1999:
        h, r = n // 100, n % 100
        return _unter100(h) + "hundert" + (_unter100(r) if r else "")
    return zahl_zu_wort(n)


# Tabel singkatan kecil -> bentuk baca Jerman.
ABK_TABEL = [
    (re.compile(r"z\.\s?B\."), "zum Beispiel"),
    (re.compile(r"u\.\s?a\."), "unter anderem"),
    (re.compile(r"d\.\s?h\."), "das heißt"),
    (re.compile(r"\bbzw\."), "beziehungsweise"),
    (re.compile(r"\bca\."), "circa"),
    (re.compile(r"\busw\."), "und so weiter"),
    (re.compile(r"\bNr\."), "Nummer"),
    (re.compile(r"\bDr\."), "Doktor"),
    (re.compile(r"\bProf\."), "Professor"),
    (re.compile(r"€"), "Euro"),
    (re.compile(r"%"), "Prozent"),
    (re.compile(r"&"), "und"),
]

_NUM_RE = re.compile(r"(?<!\w)(\d[\d.,]*)(?!\w)")


def _parse_zahl(token: str):
    """Tafsirkan token angka; titik sebagai pemisah ribuan, koma desimal diabaikan."""
    t = token.replace(".", "")  # 1.400 -> 1400
    if "," in t:
        t = t.split(",", 1)[0]
    if not t.isdigit():
        return None
    return int(t)


def normalisiere(text: str, log) -> str:
    """Kembalikan teks siap-TTS; log setiap penggantian ke callback `log`."""
    for pat, repl in ABK_TABEL:
        if pat.search(text):
            text = pat.sub(repl, text)
            log(f"singkatan/karakter '{pat.pattern}' -> '{repl}'")

    def _num(m: re.Match) -> str:
        n = _parse_zahl(m.group(1))
        if n is None:
            return m.group(0)
        wort = _jahr_zu_wort(n) if (1100 <= n <= 1999) else zahl_zu_wort(n)
        log(f"angka '{m.group(1)}' -> '{wort}'")
        return wort

    return _NUM_RE.sub(_num, text)


# --------------------------------------------------------------------------- #
# Pemecahan transkrip menjadi blok pembicara
# --------------------------------------------------------------------------- #


def parse_bloecke(transcript: str):
    """Pecah transkrip menjadi blok (sprecher_slot, teks).

    Baris "TEXT n" adalah penanda struktural -> dilewati (tidak dibacakan).
    Baris tanpa penanda pembicara (mis. monolog Teil 4) menjadi blok tersendiri
    dengan suara A.
    """
    blocks = []
    cur_slot = "a"
    cur_lines: list[str] = []

    def flush():
        nonlocal cur_lines
        txt = " ".join(l.strip() for l in cur_lines if l.strip()).strip()
        if txt:
            blocks.append((cur_slot, txt))
        cur_lines = []

    for raw in transcript.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if TEXT_MARKER_RE.match(line.strip()):
            flush()
            continue
        m = SPEAKER_RE.match(line.strip())
        if m:
            flush()
            letter = m.group(2)
            cur_slot = SPEAKER_TO_SLOT.get(letter, "a")
            cur_lines = [m.group(3)]
        else:
            cur_lines.append(line)
    flush()
    return blocks


# --------------------------------------------------------------------------- #
# Sintesis
# --------------------------------------------------------------------------- #


async def _synth_block(edge_tts, text: str, voice: str, rate: str, out: Path):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(out))


def make_silence(ffmpeg_dir: Path, ms: int, out: Path):
    subprocess.check_call(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", f"{ms / 1000:.3f}", "-ac", "1", "-ar", "24000",
            "-b:a", "48k", str(out),
        ]
    )


def concat_parts(parts: list[Path], out: Path):
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as fh:
        for p in parts:
            fh.write(f"file '{p.as_posix()}'\n")
        list_path = Path(fh.name)
    try:
        subprocess.check_call(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0", "-i", str(list_path),
                "-ac", "1", "-ar", "24000", "-b:a", "48k", str(out),
            ]
        )
    finally:
        list_path.unlink(missing_ok=True)


async def synth_teil(edge_tts, blocks, voice_for_slot, rate: str, out_mp3: Path):
    """Sintesis semua blok + jeda, concat menjadi satu mp3."""
    tmp = Path(tempfile.mkdtemp(prefix="b2tts_"))
    try:
        silence = tmp / "_silence.mp3"
        make_silence(tmp, PAUSE_MS, silence)

        parts: list[Path] = []
        for i, (slot, text) in enumerate(blocks):
            if i > 0:
                parts.append(silence)
            block_mp3 = tmp / f"blk_{i:03d}.mp3"
            voice = voice_for_slot[slot]
            await _retry_synth(edge_tts, text, voice, rate, block_mp3)
            parts.append(block_mp3)

        out_mp3.parent.mkdir(parents=True, exist_ok=True)
        concat_parts(parts, out_mp3)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


async def _retry_synth(edge_tts, text, voice, rate, out, tries: int = 3):
    last = None
    for attempt in range(1, tries + 1):
        try:
            await _synth_block(edge_tts, text, voice, rate, out)
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < tries:
                await asyncio.sleep(1.5 * attempt)
    raise last  # type: ignore[misc]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def teil_liste(data):
    """Teile-Liste einer Datei: Hören-Units nutzen 'teile', der Modelltest 'hoeren'."""
    return data.get("teile") or data.get("hoeren") or []


def find_files(unit: int | None, pruefung: str | None = None):
    """[(Pfad, art)] — art ist 'hoeren' (unit-*.json) oder 'pruefung'.

    --pruefung pruefung-01 liest src/content/modelltest/pruefung-01.json und
    synthetisiert dessen hören-Teile (audio.src wird auf <teilId>.mp3 gesetzt).
    """
    if pruefung:
        p = MODELLTEST_DIR / f"{pruefung}.json"
        if not p.exists():
            print(f"[tts] Modelltest '{pruefung}' nicht gefunden: {p.as_posix()}", file=sys.stderr)
            return []
        return [(p, "pruefung")]
    files = sorted(CONTENT_DIR.glob("unit-*.json"))
    if unit is not None:
        files = [f for f in files if re.search(rf"unit-0*{unit}\.json$", f.name)]
    return [(f, "hoeren") for f in files]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="tts.py",
        description="Sintesis audio Hören (edge-tts) dengan jeda antar pembicara.",
    )
    ap.add_argument("--unit", type=int, default=None, metavar="N",
                    help="hanya proses unit N (mis. --unit 1)")
    ap.add_argument("--pruefung", default=None, metavar="ID",
                    help="proses bagian Hören eines Model tests (mis. --pruefung pruefung-01)")
    ap.add_argument("--voice-a", default=DEFAULT_VOICE_A,
                    help=f"suara untuk SPRECHER A (default {DEFAULT_VOICE_A})")
    ap.add_argument("--voice-b", default=DEFAULT_VOICE_B,
                    help=f"suara untuk SPRECHER B (default {DEFAULT_VOICE_B})")
    ap.add_argument("--rate", default="+0%", help="laju bicara edge-tts (default +0%%)")
    ap.add_argument("--force", action="store_true",
                    help="tulis ulang mp3 walau sudah ada")
    ap.add_argument("--dry-run", action="store_true",
                    help="hanya cetak rencana, tidak menulis apa pun")
    args = ap.parse_args(argv)

    dateien = find_files(args.unit, args.pruefung)
    if not dateien:
        print("[tts] tidak ada Teil Hören yang cocok (--unit / --pruefung)", file=sys.stderr)
        return 1

    voice_for_slot = {"a": args.voice_a, "b": args.voice_b}

    # muat & susun rencana. plan-Einträge halten die audio-Dict-REFERENZ, damit
    # Änderungen direkt im geladenen JSON landen — egal ob 'teile' oder 'hoeren'.
    plan = []  # (file, data, audio, teil_id, blocks, chars)
    total_blocks = total_chars = 0
    for f, _art in dateien:
        data = load_json(f)
        for teil in teil_liste(data):
            audio = teil.get("audio")
            if not audio or not audio.get("transcript"):
                continue
            blocks = parse_bloecke(audio["transcript"])
            chars = sum(len(t) for _, t in blocks)
            total_blocks += len(blocks)
            total_chars += chars
            plan.append((f, data, audio, teil["id"], blocks, chars))

    using = []
    seen = set()
    for _, _, _, _, blocks, _ in plan:
        for slot, _ in blocks:
            if slot not in seen:
                seen.add(slot)
                using.append(slot)
    stimmen = ", ".join(f"{s}={voice_for_slot[s]}" for s in sorted(using))

    print(f"[tts] {len(plan)} Teil dari {len(dateien)} berkas · suara: {stimmen} · rate {args.rate}")
    print(f"[tts] total {total_blocks} blok · {total_chars} karakter")

    for _f, _data, _audio, teil_id, blocks, chars in plan:
        spk = sorted({slot for slot, _ in blocks})
        print(f"  - {teil_id}: {len(blocks)} blok, {chars} karakter, suara {spk}")

    if args.dry_run:
        print("[tts] --dry-run: tidak ada berkas yang ditulis.")
        return 0

    # cek dependensi hanya saat benar-benar menyintesis
    if not have("ffmpeg") or not have("ffprobe"):
        print("[tts] GALAT: ffmpeg/ffprobe tidak ditemukan di PATH. Pasang ffmpeg lalu ulangi.",
              file=sys.stderr)
        return 2
    try:
        import edge_tts  # noqa: WPS433
    except ImportError:
        print(
            "[tts] GALAT: paket 'edge-tts' belum terpasang.\n"
            "      Pasang dengan salah satu perintah:\n"
            "        uv pip install --system edge-tts\n"
            "        pip install --user edge-tts\n"
            "      lalu jalankan ulang skrip ini.",
            file=sys.stderr,
        )
        return 2

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    replaced = 0
    for f, data, audio, teil_id, blocks, chars in plan:
        out_mp3 = AUDIO_DIR / f"{teil_id}.mp3"

        if out_mp3.exists() and not args.force:
            dur = ffprobe_duration(out_mp3)
            print(f"  = {teil_id}: mp3 sudah ada ({dur:.3f}s) — lewati (pakai --force untuk tulis ulang)")
        else:
            # normalkan teks tiap blok + log penggantian
            norm_blocks = []
            for slot, text in blocks:
                norm_blocks.append((slot, normalisiere(text, lambda m, t=teil_id: print(f"    [norm {t}] {m}"))))
            try:
                asyncio.run(synth_teil(edge_tts, norm_blocks, voice_for_slot, args.rate, out_mp3))
            except Exception as exc:  # noqa: BLE001
                print(f"  x {teil_id}: sintesis GAGAL: {exc}", file=sys.stderr)
                return 3
            dur = ffprobe_duration(out_mp3)
            print(f"  + {teil_id}: {dur:.3f}s -> {out_mp3.relative_to(ROOT).as_posix()}")

        audio["dauer_sekunden"] = round(dur, 3)
        # src IMMER auf den Namen der tatsächlich geschriebenen Datei setzen
        audio["src"] = f"/audio/{teil_id}.mp3"
        write_json_preserving(f, data)
        replaced += 1

    print(f"[tts] selesai: {replaced} Teil diperbarui (dauer_sekunden terisi).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
