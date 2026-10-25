import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Abnahmekriterium TestDaF-Modul:
 *  1. Nach dem Abgeben erscheinen Wertung, Lösung und Erklärung — und zwar
 *     vollständig (früher brach ein Renderfehler den ganzen Ergebnisblock ab).
 *  2. Das Ergebnis landet in der Statistik (IndexedDB), nicht nur auf dem Schirm.
 *  3. Die Selbstkorrektur offener Antworten überschreibt dieselbe Sitzung,
 *     statt eine zweite anzulegen — Statistik und Ergebnisbild müssen gleich sein.
 *  4. Die Prüfungssimulation speichert je Aufgabe eine eigene Sitzung.
 */

/** Alle Items einer Aufgabe beantworten (ja nach Typ). */
async function beantworteAlle(page: Page, text = 'xyz'): Promise<number> {
  const items = page.locator('[data-frage][data-typ]');
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    const typ = (await it.getAttribute('data-typ')) ?? '';
    if (typ === 'kurzantwort') {
      await it.locator('input[type="text"]').fill(text);
    } else if (typ === 'zuordnung') {
      const opt = await it.locator('select option').nth(1).getAttribute('value');
      await it.locator('select').selectOption(opt ?? '');
    } else {
      await it.locator('button[data-option]').first().click();
    }
  }
  return n;
}

/** Die Sitzungstabelle am Seitenende ("Letzte Sitzungen"). */
const letzteTabelle = (page: Page) => page.getByRole('table').last();

/** Sammelt echte Laufzeitfehler auf — früher verschluckte ein Renderfehler die Wertung. */
function fehlerSammeln(page: Page): string[] {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') fehler.push(m.text());
  });
  return fehler;
}

test.describe('TestDaF: Wertung sichtbar und in der Statistik gespeichert', () => {
  test('Aufgabe abgeben → Wertung, Lösung und Statistik-Eintrag', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await page.goto('/testdaf/mt/1/lesen/1/');

    const items = await beantworteAlle(page);
    expect(items).toBeGreaterThan(0);

    await page.getByTestId('abgeben').click();

    const ergebnis = page.getByTestId('ergebnis');
    await expect(ergebnis).toBeVisible();
    await expect(ergebnis).toContainText('Ergebnis Aufgabe 1');
    await expect(ergebnis).toContainText('von 100');

    // Lösungsschlüssel steht an jedem Item — nicht nur die Punkte:
    const erstesItem = page.locator('[data-frage][data-typ]').first();
    await expect(erstesItem).toContainText(/Lösung:/);
    await expect(erstesItem.locator('.chip').first()).toHaveText(/richtig|falsch|offen/);

    await expect(page.getByTestId('testdaf-speicherhinweis')).toContainText('gespeichert');
    expect(fehler).toEqual([]);

    await page.goto('/statistik/');
    await expect(page.getByTestId('statistik-leer')).toHaveCount(0);
    await expect(page.getByTestId('statistik-app')).toContainText('TestDaF Lesen');
    await expect(letzteTabelle(page).locator('tbody tr')).toHaveCount(1);
  });

  test('Selbstkorrektur überschreibt dieselbe Sitzung (keine zweite Zeile)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await page.goto('/testdaf/mt/1/hoeren/1/');

    await beantworteAlle(page, 'xyz-keine-musterloesung');
    await page.getByTestId('abgeben').click();
    await expect(page.getByTestId('ergebnis')).toBeVisible();

    const vorher = await page.getByTestId('ergebnis').innerText();
    await expect(page.getByTestId('testdaf-speicherhinweis')).toContainText('gespeichert');

    // Item 1 selbst als richtig bewerten → Punkte müssen steigen
    const erstesItem = page.locator('[data-frage][data-typ]').first();
    await erstesItem.getByRole('button', { name: 'richtig', exact: true }).click();
    await expect(page.getByTestId('ergebnis')).not.toHaveText(vorher);
    await expect(page.locator('[data-frage][data-typ]').first()).toContainText('selbst als richtig bewertet');

    await page.waitForTimeout(800); // IndexedDB-Update abwarten
    expect(fehler).toEqual([]);

    await page.goto('/statistik/');
    await expect(letzteTabelle(page).locator('tbody tr')).toHaveCount(1);
    const gespeichert = await page.getByTestId('statistik-app').innerText();
    const treffer = /TREFFERQUOTE\s+(\d+)%/.exec(gespeichert);
    expect(Number(treffer?.[1] ?? '0')).toBeGreaterThan(0);
  });

  test('Prüfungssimulation speichert eine Sitzung je Aufgabe (6)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await page.goto('/testdaf/pruefung/1/');
    await page.getByTestId('pruefung-starten').click();

    // Leseverstehen sofort beenden, dann Hörverstehen
    await page.getByTestId('teil-beenden').click();
    await page.getByTestId('hoeren-starten').click();
    await page.getByTestId('teil-beenden').click();

    await expect(page.getByRole('heading', { name: /Prüfung beendet/ })).toBeVisible();
    await expect(page.getByTestId('testdaf-speicherhinweis')).toContainText('gespeichert');
    await page.waitForTimeout(1000); // restliche Speichervorgänge abwarten
    expect(fehler).toEqual([]);

    await page.goto('/statistik/');
    await expect(page.getByTestId('statistik-app')).toContainText('6 Sitzung(en) geladen');
    await expect(letzteTabelle(page).locator('tbody tr')).toHaveCount(6);
    await expect(page.getByTestId('statistik-app')).toContainText('TestDaF Hören');
    await expect(letzteTabelle(page)).toContainText('Prüfung');
  });

  test('Gespeicherte TestDaF-Sitzung lässt sich unter „Ansehen“ öffnen', async ({ page }) => {
    await page.goto('/testdaf/mt/1/lesen/2/'); // mc3
    await beantworteAlle(page);
    await page.getByTestId('abgeben').click();
    await expect(page.getByTestId('testdaf-speicherhinweis')).toContainText('gespeichert');

    await page.goto('/statistik/');
    await letzteTabelle(page).getByRole('link', { name: 'Ansehen' }).first().click();

    await expect(page.getByTestId('ergebnis-view')).toBeVisible();
    await expect(page.getByTestId('ergebnis-view')).toContainText('TestDaF · Leseverstehen · Aufgabe 2');
    await expect(page.getByTestId('ergebnis-view')).toContainText('Aufgaben im Detail');
  });
});
