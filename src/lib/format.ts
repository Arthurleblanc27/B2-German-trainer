/** B2-Trainer — util format & konversi angka bahasa Jerman (untuk UI dan pipeline TTS). */

export function formatUhrzeit(sekunden: number, mitStunden = false): string {
  const s = Math.max(0, Math.floor(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(rest).padStart(2, '0');
  return mitStunden || h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatZahl(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}

export function formatDatumDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

const EINER = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const ZEHNER = ['', 'zehn', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

/** 2026 → "zweitausendsechsundzwanzig" (TTS-freundliche Schreibweise, bis 9999). */
export function zahlAlsWort(n: number): string {
  if (n < 0) return 'minus ' + zahlAlsWort(-n);
  if (n < 10) return EINER[n];
  if (n < 20) {
    if (n === 11) return 'elf';
    if (n === 12) return 'zwölf';
    if (n === 16) return 'sechzehn';
    if (n === 17) return 'siebzehn';
    return EINER[n - 10] + 'zehn';
  }
  if (n < 100) {
    const z = Math.floor(n / 10);
    const e = n % 10;
    return e === 0 ? ZEHNER[z] : `${EINER[e]}und${ZEHNER[z]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${h === 1 ? 'ein' : EINER[h]}hundert${rest ? zahlAlsWort(rest) : ''}`;
  }
  const t = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${t === 1 ? 'ein' : EINER[t]}tausend${rest ? zahlAlsWort(rest) : ''}`;
}

export function jahrAlsWort(jahr: number): string {
  return zahlAlsWort(jahr);
}

/** Label für Aufgabentypen (Deutsch). Enthält auch die TestDaF-eigenen Typen. */
export const TYP_LABEL: Record<string, string> = {
  zuordnung: 'Zuordnung',
  mc3: 'Multiple Choice',
  richtigfalsch: 'Richtig / Falsch',
  'satz-luecke': 'Satz in Lücke',
  ueberschrift: 'Überschrift',
  'aussagen-person': 'Aussagen zu Personen',
  // TestDaF-Modul
  jn3: 'Ja / Nein / Text sagt nichts',
  kurzantwort: 'Kurzantwort (offen)'
};

export function scoreFarbe(prozent: number): string {
  if (prozent >= 90) return 'var(--success)';
  if (prozent >= 80) return 'var(--accent)';
  if (prozent >= 60) return 'var(--warn)';
  return 'var(--danger)';
}
