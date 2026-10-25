# Panduan Upload ke GitHub

Paket ini berisi **repositori siap-upload**: situs `b2-trainer` (Astro 5 + Preact) lengkap dengan modul TestDaF yang sudah terintegrasi.

| Item | Nilai |
| --- | --- |
| Jumlah berkas | 142 |
| Ukuran total | ± 93 MB |
| Berkas terbesar | 7,2 MB (`public/audio/hoeren-unit-02-teil1.mp3`) |
| Batas GitHub per berkas | 100 MB — aman tanpa Git LFS |
| Isi terberat | 26 MP3 di `public/audio/` (audio latihan Hören) |

**Status lahir:** repositori sudah ter-upload ke GitHub dan situsnya sudah tayang di
<https://b2-trainer.pages.dev> (Cloudflare Pages · project `b2-trainer` · production branch `main`).

---

## 1. Isi paket

```
b2-trainer/
├─ .github/workflows/ci.yml     CI: npm ci → validate → typecheck → test → build
├─ .gitattributes               MP3/PNG ditandai biner
├─ .gitignore                   mengecualikan node_modules dist .astro test-results
├─ README.md                    dokumentasi lengkap proyek
├─ UPLOAD-KE-GITHUB.md          berkas ini
├─ START.cmd                    starter Windows: dev / preview / build
├─ astro.config.mjs             konfigurasi situs + PWA + sitemap
├─ package.json                 skrip npm + daftar dependensi
├─ package-lock.json            kunci versi untuk `npm ci` di CI
├─ playwright.config.ts         konfigurasi e2e
├─ vitest.config.ts             konfigurasi unit test
├─ tsconfig.json
├─ public/                      favicon ikon og-image robots.txt + audio MP3
├─ scripts/                     validator bank soal + perkakas audio/TestDaF
├─ src/                         bank soal JSON + lib + komponen + halaman
└─ tests/                       134 unit test Vitest + 6 e2e Playwright
```

**Sengaja tidak disertakan** (bukan bagian kode sumber):

- `node_modules/` `dist/` `.astro/` `test-results/` — hasil build/instalasi. CI membangun ulang dari `package-lock.json`.
- `.shots/` `.backup-ui/` — tangkapan layar kerja dan cadangan UI lama.
- `tsprobe.ts` — berkas probe sekali pakai.
- PDF buku TestDaF (`Mit Erfolg zum TestDaF` ± 605 MB) dan `testdaf-referenz/` — materi berhak cipta. Tidak boleh masuk repositori publik. Bank soal proyek ini adalah teks karangan sendiri.

---

## 2. Cara upload — pilih satu

### Opsi A — GitHub Desktop (paling mudah)

1. Ekstrak zip ini. Hasilnya satu folder `b2-trainer`.
2. Buka GitHub Desktop → **File → Add local repository** → pilih folder `b2-trainer`.
3. Saat diminta membuat repositori → klik **create a repository** → nama `b2-trainer` → **Create repository**.
4. Klik **Publish repository**. Hilangkan centang *Keep this code private* bila ingin publik.

### Opsi B — Terminal (git)

```bash
cd b2-trainer
git init -b main
git add -A
git commit -m "B2-Trainer: situs latihan B2 + modul TestDaF"
# buat repositori kosong bernama b2-trainer di github.com lebih dulu (tanpa README)
git remote add origin https://github.com/<USERNAME>/b2-trainer.git
git push -u origin main
```

Untuk akun yang memakai 2FA → gunakan Personal Access Token sebagai password atau `gh auth login` lebih dulu.

### Opsi C — Web GitHub

GitHub **tidak menerima berkas zip** pada tombol *Add file → Upload files*. Ekstrak dulu lalu:

1. Buat repositori baru (kosong tanpa README).
2. Buka `https://github.com/<USERNAME>/b2-trainer/upload/main`.
3. Seret **isi** folder `b2-trainer` (bukan foldernya) ke halaman itu → **Commit changes**.

Cara ini berfungsi tetapi lambat untuk 142 berkas. Opsi A atau B lebih disarankan.

---

## 3. Setelah ter-upload

- Tab **Actions** → workflow `CI` berjalan otomatis pada `main`: `npm ci → validate → typecheck → test → build`. Tunggu sampai hijau.
- Deploy ke Cloudflare Pages bersifat opsional dan **mati secara bawaan**. Untuk menyalakannya → **Settings → Secrets and variables → Actions** lalu:
  1. tab **Variables** → tambah `CLOUDFLARE_DEPLOY` = `true`
  2. tab **Secrets** → tambah `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`

  Token dibuat di Cloudflare → **My Profile → API Tokens → Create Token** dengan izin *Cloudflare Pages: Edit*. Account ID terlihat di dashboard Cloudflare atau dari `wrangler whoami`.

  Selama variabel itu belum ada job deploy hanya **dilewati** (skip) sehingga CI tetap hijau. Nilai rahasia tidak pernah ditulis di dalam berkas workflow.
- Alamat situs dipakai di `astro.config.mjs` (`site`). Bila domain berubah → set variabel `SITE_URL` atau ubah nilai bawaannya.

## 4. Menjalankan secara lokal

```bash
npm install       # sekali saja
npm run dev       # http://localhost:4321
npm run build     # hasil statis di dist/
```

Di Windows cukup klik dua kali `START.cmd` lalu pilih menu 1 (dev) atau 2 (preview). `START.cmd` menjalankan `npm install` otomatis bila `node_modules` belum ada.

## 5. Verifikasi yang sudah dijalankan pada paket ini

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run validate` (bank Goethe B2) | 11 berkas · 0 error · 0 warning |
| `npm run validate:testdaf` | 14 berkas · 0 error · 0 warning |
| `npx vitest run` | 6 berkas · 134 test lulus |
| `npm run build` | 37 halaman · PWA 67 entri precache |

## 6. Lisensi

Teks dan soal adalah karangan sendiri dengan lisensi **CC BY-NC-SA 4.0** kecuali disebut lain. Materi pihak ketiga (Goethe-Institut · telc · Schubert-Verlag · DW) hanya ditautkan — tidak disalin. Repositori ini bukan sertifikat resmi dan tidak berafiliasi dengan Goethe-Institut atau telc.

Bila ingin menambahkan berkas `LICENSE` untuk kodenya → pilih lisensi di github.com saat membuat repositori (mis. MIT) agar GitHub menambahkan berkasnya otomatis.
