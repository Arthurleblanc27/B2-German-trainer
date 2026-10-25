# Pipeline audio B2-Trainer (Hören)

Cara memproduksi audio untuk unit Hören dari nol: teks transkrip → mp3 →
normalisasi → word timestamps yang bisa diklik per kata di player.

```
teks transkrip (src/content/hoeren/unit-*.json)
   → scripts/tts.py        (edge-tts; jeda 400 ms antar pembicara)
   → public/audio/<teilId>.mp3            (mp3 mentah + dauer_sekunden terisi)
   → scripts/normalize.sh  (ffmpeg loudnorm I=-16 · mono 44,1 kHz · 96 kbps)
   → scripts/align.py      (faster-whisper/whisperX → wort_timestamps)
```

## 0. Prasyarat

| Alat | Fungsi | Pasang |
|---|---|---|
| Python 3.11+ | menjalankan tts.py / align.py | sudah ada (`python3`) |
| **ffmpeg** + **ffprobe** | jeda, concat, ukur durasi, loudnorm | Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Debian: `sudo apt install ffmpeg` |
| **edge-tts** | mesin TTS gratis (Microsoft) | `uv pip install --system edge-tts` atau `pip install --user edge-tts` |
| **faster-whisper** | forced alignment / word timestamps | `uv pip install --system faster-whisper` atau `pip install --user faster-whisper` |

Cek cepat:

```bash
ffmpeg -version | head -1
ffprobe -version | head -1
python3 -c "import edge_tts, faster_whisper; print('libs OK')"
```

> `edge-tts` memakai layanan Microsoft online → butuh koneksi internet.
> Tidak butuh API key. Bila offline, lihat catatan Piper (v1) di rencana.

## 1. Perintah untuk SATU unit baru

Misal unit Hören `unit-05.json` sudah ada transkripnya (audio.dauer_sekunden 0):

```bash
cd b2-trainer

# (a) uji rencana tanpa menulis apa pun
python3 scripts/tts.py --unit 5 --dry-run

# (b) sintesis audio: tulis public/audio/hoeren-unit-05-teil{1..4}.mp3
#     sekaligus mengisi audio.dauer_sekunden dari durasi nyata (ffprobe)
python3 scripts/tts.py --unit 5

# (c) normalkan tiap mp3 in-place (loudness EBU R128)
for f in public/audio/hoeren-unit-05-teil*.mp3; do
  bash scripts/normalize.sh "$f"
done

# (d) word timestamps per kata → audio.wort_timestamps
python3 scripts/align.py --unit 5

# (e) validasi bank soal (harus 0 error; mode --strict untuk build produksi)
node scripts/validate-items.mjs
node scripts/validate-items.mjs --strict
```

Setelah (b): `dauer_sekunden > 0`. Setelah (d): `wort_timestamps` non-kosong.

### Opsi penting `tts.py`

```bash
python3 scripts/tts.py                       # semua unit yang ada
python3 scripts/tts.py --unit 1 --force      # tulis ulang mp3 yang sudah ada
python3 scripts/tts.py --pruefung pruefung-01   # bagian Hören dari modelltest
python3 scripts/tts.py --rate +10%           # bicara 10% lebih cepat
python3 scripts/tts.py --voice-a de-AT-IngridNeural --voice-b de-CH-JanNeural
python3 scripts/tts.py --dry-run             # hanya cetak rencana
```

`--pruefung <ID>` membaca `src/content/modelltest/<ID>.json` dan menyintesis
bagian `hoeren` (bukan `teile`). Nama berkas dan `audio.src` selalu
`<teilId>.mp3` (mis. `pruefung-01-hoeren-teil1.mp3`), jadi JSON tidak pernah
menunjuk berkas yang tidak ada.

- `--voice-a` → SPRECHER A, `--voice-b` → SPRECHER B (default `de-DE-KatjaNeural`
  dan `de-DE-ConradNeural`).
- Pembicara tambahan **C/D** (Teil 2/3) saat ini bergantian memakai suara A/B
  (CLI hanya punya dua suara). Untuk audio 4-penutur yang benar-benar berbeda,
  jalankan dua kali dengan suara berbeda lalu gabungkan manual, atau kembangkan
  pemetaan `SPEAKER_TO_SLOT` di `tts.py`.
- Penanda struktural `TEXT 1` … `TEXT 5` **tidak dibacakan** (hanya pemisah).
- Jeda 400 ms disisipkan otomatis antar blok pembicara.

## 2. Cara kerja `tts.py` (ringkas)

1. Baca `src/content/hoeren/unit-*.json`.
2. Pecah `audio.transcript` per blok `SPRECHER A:` / `SPRECHER B:` (baris tanpa
   penanda, mis. monolog Teil 4, jadi blok tersendiri dengan suara A).
3. **Normalisasi angka & singkatan ke bentuk baca Jerman** sebelum sintesis
   (tabel kecil: `2026 → zweitausendsechsundzwanzig`, `% → Prozent`,
   `z. B. → zum Beispiel`, `u. a. → unter anderem`, `€ → Euro`, dst.).
   Setiap penggantian dicetak ke layar.
4. Sintesis tiap blok dengan edge-tts, sisipkan senyap 400 ms (ffmpeg `anullsrc`),
   `concat` seluruhnya → `public/audio/<teilId>.mp3`.
5. Ukur durasi nyata (`ffprobe -v error -show_entries format=duration -of csv=p=0`)
   dan tulis ke `audio.dauer_sekunden`. JSON ditulis ulang dengan urutan kunci dan
   indentasi 2 spasi yang sama (CRLF dipertahankan).

## 3. Normalisasi loudness (`normalize.sh`)

```bash
bash scripts/normalize.sh raw.mp3 public/audio/hoeren-unit-01-teil1.mp3
bash scripts/normalize.sh public/audio/hoeren-unit-01-teil1.mp3   # in-place
```

Filter: `loudnorm=I=-16:TP=-1.5:LRA=11`, mono, 44,1 kHz, 96 kbps — setara target
siaran EBU R128 yang dipakai rencana. Dijalankan **setelah** `tts.py`.

## 4. Word timestamps (`align.py`)

```bash
python3 scripts/align.py --unit 1            # tambah ke Teil yang belum punya
python3 scripts/align.py --unit 1 --force    # tulis ulang
python3 scripts/align.py --pruefung pruefung-01   # modelltest Hören (B2)
python3 scripts/align.py --testdaf           # modul TestDaF: keenam tugas Hören
python3 scripts/align.py --testdaf --mt 01   # hanya Modelltest 1
python3 scripts/align.py --testdaf --force   # timpa timestamp yang sudah ada
python3 scripts/align.py --model medium      # model Whisper lebih besar = lebih akurat
```

Menghasilkan `[[start, end, wort], ...]` per Teil dan menuliskannya ke
`audio.wort_timestamps`. **Tanpa `wort_timestamps`, transkrip tidak bisa diklik
per kata di player** — ini langkah yang mengaktifkan fitur tersebut.

Bila `faster-whisper`/`whisperx` belum terpasang, skrip mencetak instruksi
instalasi dan berhenti (exit 2) — tidak berpura-pura berhasil.

> Catatan: `faster-whisper` menghasilkan word timestamps dari transkripsi audio
> aktual. Untuk alignment benar-benar terpaku pada teks transkrip (bukan hasil
> transkripsi ulang), pasang `whisperx` (wav2vec2 Jerman) — dideteksi otomatis
> bila `faster-whisper` tidak ada.
>
> **Kecepatan (CPU tanpa GPU):** ukur nyata di mesin ini — `base` ≈ 0,6×
> realtime untuk model `small` ≈ 1,7× (lebih lambat dari realtime). Karena itu,
> pada mesin CPU-saja jalankan `--model base` (atau `tiny`) agar unit 4 Teil
> (~20 menit audio) selesai dalam waktu wajar; `small`/`medium` butuh GPU.
> `align.py` mengodekan audio lewat ffmpeg (bukan PyAV) sehingga tahan terhadap
> perubahan API `av`.

## 5. Lisensi & sumber

- **Semua audio adalah karya sendiri** (`source_type: "own"`): dibuat dari teks
  yang ditulis untuk proyek ini melalui edge-tts lalu ffmpeg.
- **JANGAN PERNAH mengunduh, menyimpan, atau menyajikan ulang audio berhak cipta**
  (mis. materi latihan DW, Goethe-Institut, telc, Schubert). Validator
  `validate-items.mjs` memperingatkan bila `attribution` menyebut sumber tersebut.
- Setiap item Hören wajib punya `attribution` yang jelas bila `source_type != "own"`.

## 6. Pemecahan masalah

| Gejala | Sebab / solusi |
|---|---|
| `edge-tts ... belum terpasang` | pasang: `uv pip install --system edge-tts` |
| `ffmpeg/ffprobe tidak ditemukan` | pasang ffmpeg, pastikan ada di PATH |
| sintesis gagal / timeout | cek koneksi; edge-tts butuh internet; ulangi (ada retry 3×) |
| `dauer_sekunden` tetap 0 | jalankan `tts.py` tanpa `--dry-run`, cek mp3 ada di disk |
| `wort_timestamps` kosong | `faster-whisper`/`whisperx` belum terpasang → `align.py` beri instruksi |
| validator `audio-todo` (warning) | normal di mode dev; hilang setelah audio diproduksi |
