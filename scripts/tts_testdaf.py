#!/usr/bin/env python3
"""
TestDaF-Modul — TTS für die Hörtexte (edge-tts + ffmpeg).

Erzeugt aus jedem Hören-Transkript eine MP3: Sprecherzeilen werden erkannt
([A] … , [Moderatorin] … ), jeder Sprecher bekommt eine feste deutsche Stimme
(Standard = de-DE, mit einzelnen AT/CH-Akzenten für Hörvielfalt). Die Teile
werden mit ffmpeg zusammengefügt, auf -16 LUFS normalisiert, dann wird die
Dauer gemessen und in die JSON zurückgeschrieben (audio.dauer_sekunden,
audio.stimme, audio.sprecher).

    python3 scripts/tts_testdaf.py                 # fehlende Audiofiles erzeugen
    python3 scripts/tts_testdaf.py --force         # alles neu erzeugen
    python3 scripts/tts_testdaf.py --nur mt01      # nur Modelltest 1
    python3 scripts/tts_testdaf.py --text mt01-hoeren-1   # nur eine Aufgabe
    python3 scripts/tts_testdaf.py --max 2         # nur 2 Aufgaben (Testlauf)

Danach: node scripts/validate-testdaf.mjs --strict
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    import edge_tts
except ImportError:  # pragma: no cover
    print("edge-tts fehlt — bitte installieren:  python3 -m pip install edge-tts", file=sys.stderr)
    raise SystemExit(2)

HIER = os.path.dirname(os.path.abspath(__file__))
PROJEKT = os.path.dirname(HIER)
BANK = os.path.join(PROJEKT, "src", "content-testdaf")
AUDIO_DIR = os.path.join(PROJEKT, "public", "audio")

VOICES = [
    "de-DE-KatjaNeural",
    "de-DE-ConradNeural",
    "de-DE-AmalaNeural",
    "de-DE-KillianNeural",
    "de-AT-IngridNeural",
    "de-AT-JonasNeural",
]
TEMP = "%-8s"  # einheitliches Tempo


def finde_hoeren_dateien(nur: str | None) -> list[str]:
    treffer = []
    for wurzel, _, dateien in os.walk(BANK):
        for d in sorted(dateien):
            if not d.endswith(".json"):
                continue
            pfad = os.path.join(wurzel, d)
            rel = os.path.relpath(pfad, BANK).replace("\\", "/")
            if "_" in os.path.basename(d):
                continue
            if "hoeren" not in rel and "hoeren" not in d:
                continue
            if nur and nur not in rel:
                continue
            with open(pfad, encoding="utf-8") as f:
                daten = json.load(f)
            if isinstance(daten.get("audio"), dict):
                treffer.append(pfad)
    return sorted(treffer)


def sprecher_segmente(transcript: str) -> list[tuple[str, str]]:
    """Transkript → [(sprecher, text)] in Reihenfolge."""
    segmente: list[tuple[str, str]] = []
    for roh in transcript.splitlines():
        zeile = roh.strip()
        if not zeile:
            continue
        m = re.match(r"^\[([^\]]+)\]\s*(.*)$", zeile)
        if m:
            wer, text = m.group(1).strip(), m.group(2).strip()
        else:
            wer, text = (segmente[-1][0] if segmente else "Sprecher"), zeile
        if not text:
            continue
        if segmente and segmente[-1][0] == wer:
            segmente[-1] = (wer, segmente[-1][1] + " " + text)
        else:
            segmente.append((wer, text))
    return segmente


def stimmen_zuordnen(segmente: list[tuple[str, str]]) -> dict[str, str]:
    zuordnung: dict[str, str] = {}
    for wer, _ in segmente:
        if wer in zuordnung:
            continue
        zuordnung[wer] = VOICES[len(zuordnung) % len(VOICES)]
    return zuordnung


async def tts_abschnitt(
    text: str, voice: str, ziel: str, rate: str = "-4%", pitch: str = "-2Hz"
) -> list[tuple[float, float, str]]:
    """Ein Segment synthetisieren und die echten Wortgrenzen zurückgeben.

    In-Process statt `python -m edge_tts` pro Segment: der Start eines neuen
    Interpreters je Absatz kostete ~2 s pro Segment und ließ lange Dialoge
    über die Zeitgrenze laufen. `stream()` liefert außerdem WordBoundary-Ereignisse
    des TTS-Dienstes — daraus entstehen die wortgenauen Zeitstempel, ohne
    zusätzliches Alignment-Werkzeug.

    Rückgabe: [(start_sekunden, ende_sekunden, wort)] relativ zum Segment.
    """
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    worte: list[tuple[float, float, str]] = []
    with open(ziel, "wb") as f:
        async for teil in communicate.stream():
            if teil["type"] == "audio":
                f.write(teil["data"])
            elif teil["type"] == "WordBoundary":
                # offset/duration in 100-Nanosekunden-Einheiten
                start = teil["offset"] / 10_000_000
                ende = (teil["offset"] + teil["duration"]) / 10_000_000
                worte.append((round(start, 3), round(ende, 3), teil["text"]))
    return worte


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def konkat(teile: list[str], ziel: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        for t in teile:
            f.write(f"file '{os.path.abspath(t).replace(chr(92), '/')}'\n")
        liste = f.name
    try:
        ffmpeg("-f", "concat", "-safe", "0", "-i", liste, "-ar", "24000", "-ac", "1",
               "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,atempo=1.0", "-b:a", "96k", ziel)
    finally:
        os.unlink(liste)


def dauer(pfad: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", pfad],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return round(float(out), 3) if out else 0.0


async def verarbeite(pfad: str, force: bool) -> tuple[bool, str]:
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    au = daten["audio"]
    rel = os.path.relpath(pfad, BANK).replace("\\", "/")
    ziel_rel = au.get("src") or f"/audio/{daten['id']}.mp3"
    ziel = os.path.join(PROJEKT, "public", ziel_rel.replace("/", os.sep).lstrip("\\/"))
    os.makedirs(os.path.dirname(ziel), exist_ok=True)

    if os.path.exists(ziel) and not force and au.get("dauer_sekunden", 0) > 0:
        return False, f"{rel}: Audio existiert bereits ({au['dauer_sekunden']}s) — übersprungen"

    segmente = sprecher_segmente(au["transcript"])
    if not segmente:
        return False, f"{rel}: kein Text im Transkript"
    stimmen = stimmen_zuordnen(segmente)

    work = tempfile.mkdtemp(prefix="testdaf-tts-")
    try:
        teile = [os.path.join(work, f"seg-{i:04d}.mp3") for i in range(len(segmente))]
        # Parallel synthetisieren, aber begrenzt — der Dienst drosselt sonst.
        grenze = asyncio.Semaphore(4)

        async def eins(i: int) -> None:
            async with grenze:
                wer, text = segmente[i]
                await tts_abschnitt(text, stimmen[wer], teile[i])

        for versuch in (1, 2):
            try:
                await asyncio.gather(*(eins(i) for i in range(len(segmente))))
                if all(os.path.exists(t) and os.path.getsize(t) > 0 for t in teile):
                    break
            except Exception:  # noqa: BLE001
                if versuch == 2:
                    raise
                await asyncio.sleep(2)
        fehlend = [i for i, t in enumerate(teile) if not (os.path.exists(t) and os.path.getsize(t) > 0)]
        for i in fehlend:
            wer, text = segmente[i]
            await tts_abschnitt(text, stimmen[wer], teile[i])
        konkat(teile, ziel)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    neu_dauer = dauer(ziel)
    au["dauer_sekunden"] = neu_dauer
    au["stimme"] = "+".join(dict.fromkeys(stimmen.values()))
    au["sprecher"] = list(stimmen.keys())
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return True, f"{rel} → {os.path.basename(ziel)} ({neu_dauer:.1f}s, {len(segmente)} Segmente, Stimmen: {', '.join(au['sprecher'])})"


async def main() -> int:
    ap = argparse.ArgumentParser(description="TTS für TestDaF-Hörtexte (edge-tts)")
    ap.add_argument("--force", action="store_true", help="vorhandene Audiodateien neu erzeugen")
    ap.add_argument("--nur", default=None, help="nur Dateien, deren Pfad diesen Text enthält (z. B. mt01)")
    ap.add_argument("--text", default=None, help="nur Dateien, deren Pfad diesen Text enthält (z. B. mt02-hoeren-3)")
    ap.add_argument("--max", type=int, default=0, help="höchstens N Aufgaben verarbeiten")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg nicht gefunden — bitte installieren.", file=sys.stderr)
        return 2

    dateien = finde_hoeren_dateien(args.nur or args.text)
    if args.max:
        dateien = dateien[: args.max]
    if not dateien:
        print(f"Keine Hören-Dateien mit audio gefunden unter {BANK}")
        return 1

    print(f"TestDaF-TTS: {len(dateien)} Hören-Aufgabe(n)")
    fehler = 0
    erzeugt = 0
    for pfad in dateien:
        try:
            gemacht, meldung = await verarbeite(pfad, args.force)
            erzeugt += 1 if gemacht else 0
            print(("  ✓ " if gemacht else "  · ") + meldung)
        except subprocess.CalledProcessError as e:
            fehler += 1
            print(f"  ✗ {os.path.relpath(pfad, BANK)}: Kommando fehlgeschlagen — {e}")
        except Exception as e:  # noqa: BLE001
            fehler += 1
            print(f"  ✗ {os.path.relpath(pfad, BANK)}: {e}")

    print(f"\n{erzeugt} Datei(en) erzeugt, {fehler} Fehler.")
    print("Nächster Schritt: node scripts/validate-testdaf.mjs --strict")
    return 1 if fehler else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
