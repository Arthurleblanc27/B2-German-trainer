/**
 * Dev-Helfer: erzeugt Screenshots für den Abnahme-Nachweis des TestDaF-Moduls.
 * Aufruf: node scripts/shot-testdaf.mjs http://localhost:4321
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const basis = process.argv[2] ?? 'http://localhost:4321';
mkdirSync('.shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function beantworteAlle() {
  const items = page.locator('[data-frage][data-typ]');
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    const typ = await it.getAttribute('data-typ');
    if (typ === 'kurzantwort') await it.locator('input[type="text"]').fill('xyz-keine-musterloesung');
    else if (typ === 'zuordnung') {
      const opt = await it.locator('select option').nth(1).getAttribute('value');
      await it.locator('select').selectOption(opt ?? '');
    } else await it.locator('button[data-option]').first().click();
  }
}

// 1) Eine Aufgabe abgeben → Wertung sichtbar
await page.goto(`${basis}/testdaf/mt/1/lesen/1/`);
await beantworteAlle();
await page.getByTestId('abgeben').click();
await page.getByTestId('ergebnis').waitFor();
await page.getByTestId('testdaf-speicherhinweis').getByText('gespeichert').waitFor();
await page.screenshot({ path: '.shots/testdaf-wertung.png', fullPage: false });

// 2) Kurzantwort-Aufgabe + Selbstkorrektur
await page.goto(`${basis}/testdaf/mt/1/hoeren/1/`);
await beantworteAlle();
await page.getByTestId('abgeben').click();
await page.getByTestId('ergebnis').waitFor();
await page.locator('[data-frage][data-typ]').first().getByRole('button', { name: 'richtig', exact: true }).click();
await page.waitForTimeout(900);

// 3) Statistik mit den gespeicherten TestDaF-Sitzungen
await page.goto(`${basis}/statistik/`);
await page.getByText('Letzte Sitzungen').waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: '.shots/testdaf-statistik.png', fullPage: true });

console.log('Screenshots: .shots/testdaf-wertung.png, .shots/testdaf-statistik.png');
console.log('Überblick:', (await page.getByTestId('statistik-app').innerText()).slice(0, 220).replace(/\n+/g, ' | '));
await browser.close();
