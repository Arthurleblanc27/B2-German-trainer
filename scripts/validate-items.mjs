#!/usr/bin/env node
/**
 * B2-Trainer — Validator bank soal (prebuild).
 *
 *   node scripts/validate-items.mjs            # build/dev
 *   node scripts/validate-items.mjs --strict   # build produksi (audio wajib siap)
 *
 * Membaca src/content/**\/*.json, memvalidasi dengan Zod + aturan lintas-field
 * dari src/data/schema.ts dan MENGGAGALKAN build (exit 1) bila ada pelanggaran.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

const mod = await import(pathToFileURL(path.join(ROOT, 'src/data/schema.ts')).href);
const { UnitSchema, PruefungSchema, validateUnit, validatePruefung, FORBIDDEN_SOURCE_TYPE } = mod;

const CONTENT_DIR = path.join(ROOT, 'src/content');
const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.json')) out.push(p);
  }
  return out;
}

/** Deteksi `source_type: "external-link"` atau key terlarang lain di berkas mentah. */
function scanRaw(raw, rel) {
  const issues = [];
  if (raw.includes(`"${FORBIDDEN_SOURCE_TYPE}"`)) {
    issues.push({
      level: 'error',
      code: 'external-link',
      message: `source_type "${FORBIDDEN_SOURCE_TYPE}" ist im Kernbank verboten — nur auf /quellen erlaubt`
    });
  }
  for (const verboten of ['goethe', 'telc', 'schubert', 'deutsch-to-go']) {
    const re = new RegExp(`"attribution"\\s*:\\s*"[^"]*${verboten}`, 'i');
    if (re.test(raw)) {
      issues.push({
        level: 'warning',
        code: 'fremdquelle',
        message: `attribution erwähnt "${verboten}" — prüfen: darf kein Fremdmaterial im Bank sein`
      });
    }
  }
  return issues;
}

const files = walk(CONTENT_DIR).sort();
if (files.length === 0) {
  console.log(c.yellow('⚠  Kein Inhalt in src/content gefunden (Bank noch leer) — Build läuft weiter.'));
  process.exit(0);
}

let errorCount = 0;
let warnCount = 0;
const seenIds = new Map();
const rows = [];
const details = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const segments = rel.split('/');
  const bucket = segments[segments.length - 2]; // lesen | hoeren | modelltest
  let raw = '';
  let data;
  let issues = [];
  try {
    raw = readFileSync(file, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    issues.push({ level: 'error', code: 'json', message: `JSON nicht lesbar: ${e.message}` });
  }

  if (data && issues.length === 0) {
    issues.push(...scanRaw(raw, rel));
    const isPruefung = bucket === 'modelltest';
    const parsed = (isPruefung ? PruefungSchema : UnitSchema).safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          level: 'error',
          code: 'zod',
          message: `${issue.path.join('.') || '(root)'}: ${issue.message}`
        });
      }
    } else {
      issues.push(...(isPruefung ? validatePruefung(parsed.data, { strict: STRICT }) : validateUnit(parsed.data, { strict: STRICT })));
      // konsistensi folder
      if (!isPruefung && parsed.data.skill !== bucket) {
        issues.push({ level: 'error', code: 'folder', message: `skill "${parsed.data.skill}" liegt in Ordner "${bucket}/"` });
      }
      const registerId = (id, kind) => {
        if (seenIds.has(id)) {
          issues.push({ level: 'error', code: 'id-duplikat', message: `${kind}-id "${id}" bereits in ${seenIds.get(id)}` });
        } else {
          seenIds.set(id, rel);
        }
      };
      registerId(parsed.data.id, isPruefung ? 'pruefung' : 'unit');
      const teile = isPruefung ? [...parsed.data.lesen, ...parsed.data.hoeren] : parsed.data.teile;
      for (const t of teile) registerId(t.id, 'teil');
    }
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  errorCount += errors.length;
  warnCount += warnings.length;
  rows.push({ rel, errors: errors.length, warnings: warnings.length });
  if (issues.length) details.push({ rel, issues });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(c.bold('\nB2-Trainer — Validasi bank soal'));
console.log(c.dim(`  ${files.length} Berkas · ${STRICT ? 'mode STRICT (produksi)' : 'mode dev'}\n`));
for (const r of rows) {
  const status = r.errors ? c.red(`✗ ${r.errors} error`) : c.green('✓ OK');
  const w = r.warnings ? c.yellow(` (${r.warnings} warning)`) : '';
  console.log(`  ${status}  ${pad(r.rel, 42)}${w}`);
}

if (details.length) {
  console.log('');
  for (const d of details) {
    console.log(c.bold(`  ${d.rel}`));
    for (const i of d.issues) {
      const tag = i.level === 'error' ? c.red('ERROR  ') : c.yellow('WARNUNG');
      console.log(`    ${tag} [${i.code}] ${i.message}`);
    }
    console.log('');
  }
}

console.log(
  `${c.bold('  Total')}: ${errorCount ? c.red(errorCount + ' error') : c.green('0 error')}, ${
    warnCount ? c.yellow(warnCount + ' warning') : '0 warning'
  }\n`
);

if (errorCount > 0) {
  console.log(c.red('  ✗ Validasi GAGAL — build dihentikan.\n'));
  process.exit(1);
}
console.log(c.green('  ✓ Validasi lulus.\n'));
