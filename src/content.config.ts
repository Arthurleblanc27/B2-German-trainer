/**
 * B2-Trainer — bewusst LEERE Content-Collections.
 * Der Bank soal liegt als reines JSON unter src/content/** und wird über
 * `import.meta.glob` in src/lib/content.ts geladen (Kontrakt: src/data/schema.ts).
 * Ohne diese Datei würde Astro automatisch Collections anlegen und nach Markdown
 * suchen — das erzeugt nur Warnungen und keinen Nutzen.
 */
export const collections = {};
