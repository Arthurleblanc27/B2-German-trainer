# B2-Trainer

Situs latihan mandiri **Bahasa Jerman level B2** (Leseverstehen + Hörverstehen) yang berjalan sepenuhnya di browser.
Dibuat untuk pelajar yang mempersiapkan **Goethe-Zertifikat B2** atau **telc Deutsch B2** dan butuh latihan terstruktur
tanpa langganan, tanpa server, dan tanpa akun.

> Semua materi pihak ketiga **hanya ditautkan**, tidak pernah disalin. Seluruh bank soal inti adalah **teks karangan sendiri**.
> Detail lengkap ada di halaman [`/quellen`](https://b2-trainer.pages.dev/quellen/) dan di [Kebijakan Lisensi](#kebijakan-lisensi--konten) di bawah.

---

## Apa itu B2-Trainer?

- **Sasaran:** pelajar tingkat B2 yang ingin berlatih Lesen & Hören dengan format ujian sebenarnya.
- **Model:** situs statis (Astro) + penyimpanan kemajuan lokal (IndexedDB/Dexie) — offline-capable via PWA, tanpa backend.
- **Fitur v1:**
  - **Leseverstehen** — unit dengan 5 Teil / 30 Aufgaben, dievaluasi per soal lengkap dengan **Belegzitat** (kutipan bukti).
  - **Hörverstehen** — 4 Teil / 30 Aufgaben dengan batas pemutaran audio ala ujian (Teil 1 sekali, Teil 2–4 dua kali).
  - **Prüfungssimulator** — ujian penuh berwaktu (Lesen 65′ / Hören ±40′), skala 100, ambang lulus 60.
  - **Laporan hasil** (Ergebnis) — rincian salah/benar, evidence, dan fungsi cetak (print).
  - **Glossar & SRS** — kosakata per Teil dengan pengulangan berjeda (spaced repetition).
  - Bank soal 100% JSON lokal; validator build menolak item cacat.
  - PWA + dukungan gelap/terang dan ukuran font.

---

## Stack & alasan

| Teknologi | Alasan |
| --- | --- |
| **Astro 5** (`output: 'static'`) | HTML statis cepat, tanpa runtime server; cocok untuk latihan pribadi & hosting murah. |
| **Preact islands** (`@astrojs/preact`) | Interaktivitas (runner, timer, audio player) hanya di tempat yang perlu — JS minimal. |
| **Tailwind CSS 4** (`@tailwindcss/vite`) | Styling cepat dengan design-token di `src/styles/global.css`. |
| **TypeScript + Zod** | Kontrak data tunggal di `src/data/schema.ts`; validasi JSON saat build. |
| **Dexie (IndexedDB)** | Simpan kemajuan/SRS secara lokal — tidak mengirim data ke mana pun. |
| **@astrojs/sitemap** | Menghasilkan `sitemap-index.xml` saat build. |
| **@vite-pwa/astro** | Situs dapat dipasang (installable) dan sebagian offline. |
| **Vitest + Playwright** | Unit test cepat + e2e untuk alur ujian. |

---

## Struktur folder

```
b2-trainer/
├─ src/
│  ├─ content/            # Bank soal (JSON) — satu berkas = satu Unit
│  │  ├─ lesen/           #   unit-01.json … unit-06.json
│  │  ├─ hoeren/          #   unit-01.json … unit-04.json
│  │  └─ modelltest/      #   berkas Pruefung (opsional)
│  ├─ data/schema.ts      # KONTRAK DATA TUNGGAL — Zod + aturan validasi lintas-field
│  ├─ lib/                # Logika murni: content, scoring, analyse, srs, storage, timer, format
│  ├─ components/         # Komponen Preact (ExamRunner, TeilRunner, AudioPlayer, Ergebnis, …)
│  ├─ layouts/Base.astro  # Layout global (header, nav, footer, dark-mode, SEO dasar)
│  ├─ pages/              # Route: /, /lesen/, /hoeren/, /pruefung/, /ergebnis/, /quellen/, /404
│  └─ styles/global.css   # Design-token + kelas komponen (.karte, .btn, .chip, …)
├─ scripts/
│  ├─ validate-items.mjs  # Validator bank soal (dijalankan saat prebuild)
│  └─ make-icons.py       # Helper pembuat ikon PWA
├─ public/                # Aset statis (favicon, ikon, og-image, robots.txt, audio/)
├─ tests/                 # Unit test (Vitest) + konfigurasi Playwright
└─ .github/workflows/ci.yml
```

### `src/data/schema.ts` — kontrak tunggal

Berkas ini adalah **satu-satunya sumber kebenaran** untuk bentuk data. Setiap item bank, validator build, mesin skor,
dan komponen UI merujuk ke sini. **Jangan ubah bentuk field** tanpa memperbarui validator + test. Di dalamnya antara lain:

- `SCHEMA_VERSION`, `SKILLS` (`lesen`, `hoeren`), `FRAGE_TYPEN`, `THEMENFELDER`
- `SOURCE_TYPES` (`own`, `ai`, `public-domain`) dan `LIZENZEN`
- `TEIL_SPEC` — tabel format ujian yang mengikat (jumlah soal & menit per Teil)
- Skema Zod: `UnitSchema`, `TeilSchema`, `FrageSchema`, `PruefungSchema`, …
- Fungsi validasi semantik: `validateTeil`, `validateUnit`, `validatePruefung`, `evidenceIsVerbatim`

---

## Perintah

```bash
npm run dev            # Server pengembangan (http://localhost:4321)
npm run validate       # Validasi bank soal (mode dev — audio belum wajib)
npm run validate:strict# Validasi mode produksi (audio wajib sudah diproduksi)
npm run typecheck      # astro check (TypeScript + template .astro)
npm run test           # Unit test (Vitest, sekali jalan)
npm run test:watch     # Unit test mode watch
npm run test:e2e       # End-to-end test (Playwright)
npm run build          # Build statis → dist/ (menjalankan validate via prebuild)
npm run preview        # Pratinjau hasil build
```

> `npm run build` otomatis menjalankan `prebuild` (`validate`) terlebih dahulu — build **gagal** bila ada item cacat.

---

## Menambah unit baru

Satu berkas JSON = satu **Unit** (berisi semua Teil). Simpan di `src/content/<skill>/unit-NN.json`.
`skill` di dalam berkas **harus** cocok dengan nama folder (`lesen/`, `hoeren/`, atau `modelltest/`).

### Kerangka JSON (ringkas)

```jsonc
{
  "schemaVersion": 1,
  "id": "lesen-07",
  "skill": "lesen",
  "unit": 7,
  "level": "B2",
  "themenfeld": "Umwelt & Klima",
  "titel": "Klimawandel im Alltag",
  "titel_id": "Perubahan iklim dalam kehidupan sehari-hari",
  "beschreibung_id": "…",
  "teile": [
    {
      "id": "lesen-07-t1",
      "skill": "lesen",
      "teil": 1,
      "themenfeld": "Umwelt & Klima",
      "titel": "…",
      "instruktion_de": "…",
      "instruktion_id": "…",
      "zeit_minuten": 18,
      "source_type": "own",
      "lizenz": "CC-BY-NC-SA-4.0",
      "attribution": "B2-Trainer (eigener Text)",
      "texte": [ /* 4 Texte/Personen */ ],
      "fragen": [
        {
          "nr": 1,
          "typ": "zuordnung",
          "stamm_de": "…",
          "stamm_id": "…",
          "optionen": [{ "key": "a", "text": "…" }],
          "loesung": ["b"],
          "punkte": 1,
          "explain_de": "…",
          "explain_id": "…",
          "evidence": "wörtliches Zitat aus dem Text"
        }
      ],
      "punkte_max": 9,
      "glossar": [ /* ≥ 8 Einträge pro Lesetext */ ]
    }
    /* … Teile 2–5 */
  ]
}
```

### Aturan yang ditegakkan validator (`scripts/validate-items.mjs`)

**Struktur & jumlah**
- Lesen: harus ada tepat Teil **1–5** dengan jumlah soal **9 / 6 / 6 / 6 / 3** (total 30).
- Hören: harus ada tepat Teil **1–4** dengan jumlah soal **10 / 6 / 6 / 8** (total 30).
- `punkte_max` tiap Teil **harus sama dengan jumlah `punkte`** semua soal di Teil itu.
- Nomor soal (`nr`) harus **lengkap 1..n** (tanpa duplikat, tanpa lompatan).
- `id` Teil **wajib** diawali `"<skill>-"`; `id` Unit/Teil **harus unik** di seluruh bank.

**Bukti (`evidence`) — verbatim**
- `evidence` setiap soal **harus berupa kutipan verbatim** dari teks/transkrip Teil (dicek `evidenceIsVerbatim`).
  Perbandingan menormalkan huruf kecil, spasi, dan tanda kutip.

**Kunci jawaban**
- Setiap nilai di `loesung` harus **menunjuk ke opsi yang ada** (`optionen` / `optionen_saetze` / `ueberschriften`).
- Soal `richtigfalsch` → `loesung` hanya boleh `"richtig"` atau `"falsch"`.
- Format khusus: Lesen Teil 2 butuh `luecken_text` dengan placeholder `[[1]]`…`[[6]]` + tepat **8 Satzoptionen (a–h)**;
  Lesen Teil 5 butuh tepat **8 Überschriften** dan 4 Absätze; Lesen Teil 1 & 4 butuh tepat **4 Texte/Personen**.
- Hören **wajib** punya objek `audio` dengan `transcript` non-kosong (dan `dauer_sekunden > 0` di mode strict).

**Lisensi & sumber (`source_type` whitelist)**
- `source_type` **hanya boleh**: `own`, `ai`, atau `public-domain`. Nilai `external-link` **dilarang** di bank inti
  (hanya boleh dipakai di halaman `/quellen`).
- `lizenz` **harus** salah satu dari whitelist: `CC-BY-NC-SA-4.0`, `CC-BY-SA-4.0`, `CC0-1.0`, `proprietary`.
- Bila `source_type != "own"`, field `attribution` **wajib** diisi (min. 3 karakter).

**Peringatan (warning, tidak menggagalkan build)**
- Rasio jawaban `"falsch"` ≥ 40% untuk soal Richtig/Falsch; hindari >3 kunci sama berurutan; `glossar` < 8 entri; dsb.

Jalankan `npm run validate` setiap kali menambah/mengubah JSON.

---

## Modul TestDaF & penyimpanan hasil

- Bank soal TestDaF terpisah dari bank Goethe B2: `src/content-testdaf/{modelltest,mt01,mt02}/*.json`,
  dengan validator sendiri (`npm run validate:testdaf`).
- **Pemuatan konten memakai `parse`, bukan cast.** Berkas JSON menghilangkan field opsional
  (`schluessel` hanya diisi pada tipe `kurzantwort`), dan justru skema Zod di `src/data/testdaf.ts`
  yang mengisi default-nya. Cast langsung menyisakan `undefined` saat runtime — satu error render
  cukup untuk menghapus **seluruh** blok hasil (skor, kunci jawaban, penjelasan sekaligus).
- **Hasil TestDaF disimpan ke IndexedDB yang sama dengan modul B2** (jembatan: `src/lib/testdaf-progress.ts`
  → `speichereSesi` / `aktualisiereSesi`). Satu Aufgabe = satu sesi: `skill` = lesen/hoeren,
  `teil` = nomor Aufgabe, `unitId` = `testdaf-mtNN`. Karena itu nilainya ikut muncul di `/statistik/`
  (Trefferquote, heatmap, tren, Prüfungsreife), di Fehlerheft, dan di `/ergebnis/?sesi=<id>`.
  Koreksi mandiri jawaban terbuka menimpa sesi yang sama supaya angka statistik identik dengan layar.
- End-to-end: `tests/e2e/testdaf-statistik.spec.ts` mengunci empat hal — nilai & kunci tampil,
  sesi masuk statistik, koreksi mandiri tidak menggandakan sesi, dan simulasi ujian menyimpan 6 sesi.

---

## Kebijakan lisensi & konten

- **Bank soal inti:** teks & soal **karangan sendiri** (`source_type: own`/`ai`/`public-domain`) dengan lisensi
  **CC BY-NC-SA 4.0** (kecuali item menyebut lain). Teks ber-`source_type: "ai"` ditandai eksplisit sebagai hasil AI.
- **Materi pihak ketiga:** Goethe-Institut, telc, Schubert-Verlag, deutsch-to-go.de, DW, dsb. **hanya ditautkan**.
  Soal, kunci, transkrip, dan audio mereka **tidak** diunduh, disalin, atau di-host ulang di sini.
- **Bukan sertifikat:** skor & status "lulus" adalah nilai latihan, bukan sertifikat resmi.
- **Tidak berafiliasi** dengan Goethe-Institut atau telc.

Daftar sumber lengkap + catatan lisensi per sumber: lihat **[/quellen](https://b2-trainer.pages.dev/quellen/)**.

---

## Status audio

- **Audio sudah diproduksi**: 20 Teil = 16 Teil (Unit 1–4) + 4 Teil (Modelltest `pruefung-01`), alle als
  `/public/audio/<teilId>.mp3` (siehe `dist/audio/` nach dem Build).
- Format: **mono 44,1 kHz, ~96 kbps, EBU R128 loudnorm (I = −16 LUFS)** — Ergebnis von `scripts/normalize.sh`.
- `audio.dauer_sekunden` ist überall mit den gemessenen Dateidauern gefüllt (z. B. `hoeren-unit-01-teil1` = 604,952 s,
  `pruefung-01-hoeren-teil1` = 601,096 s) und `audio.wort_timestamps` enthält 1.200–1.300 Wörter pro Teil, sodass das
  Transkript **klickbar pro Wort** ist (Sprung an die passende Stelle im Audio).
- Damit läuft `npm run validate` mit **0 Fehler / 0 Warnungen**, und `npm run validate:strict` (audio-pflichtig) ist erfüllt.
- `audio.play_limit_pruefung` folgt der Prüfungsregel: Teil 1 = 1×, Teil 2–4 = 2×.
- Reproduzieren/erweitern: `python3 scripts/tts.py --unit N` bzw. `--pruefung pruefung-01`, danach
  `python3 scripts/align.py …` und `bash scripts/normalize.sh <datei.mp3>` — Details in `scripts/README-AUDIO.md`.
- Hinweis zur Qualität: die Stimmen sind TTS (edge-tts, model `base` fürs Alignment). Für echtes Hörverstehen mit
  Muttersprachlern zusätzlich die verlinkten Quellen auf `/quellen` nutzen.

---

## SEO & deploy

- `public/robots.txt` mengizinkan semua crawler dan menunjuk ke `sitemap-index.xml` (dibuat oleh `@astrojs/sitemap`).
- Halaman `/quellen` menyertakan **JSON-LD** (`schema.org` `WebPage` + `ItemList`).
- CI di `.github/workflows/ci.yml`: `npm ci → validate → typecheck → test → build → upload artifact dist`,
  plus job deploy opsional ke **Cloudflare Pages** (butuh secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
