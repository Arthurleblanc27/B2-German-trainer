import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

// JSON wird über fs gelesen: Playwrights ESM-Loader verlangt sonst
// `with { type: 'json' }` und bricht mit "needs an import attribute".
const lesenUnit01 = JSON.parse(readFileSync('src/content/lesen/unit-01.json', 'utf8')) as {
  teile: { fragen: { explain_de: string; evidence: string }[] }[];
};

/**
 * Abnahmekriterium aus dem Plan: eine komplette Lesen-Einheit muss ohne Maus
 * lösbar und auswertbar sein — und vor der Abgabe darf keine Lösung sichtbar sein.
 */
test.describe('Nur-Tastatur-Bedienung', () => {
  test('Lesen Unit 1 / Teil 1: starten, 9 Aufgaben lösen, abgeben', async ({ page }) => {
    await page.goto('/lesen/1/');

    const start = page.getByTestId('start-teil-1');
    await start.focus();
    await page.keyboard.press('Enter'); // Button muss per Enter auslösbar sein
    await expect(page.getByTestId('teil-runner')).toBeVisible();

    // A–H wählt die Option und springt automatisch zur nächsten Aufgabe
    for (let i = 0; i < 9; i++) await page.keyboard.press('a');
    await expect(page.getByText('9 von 9 beantwortet')).toBeVisible();

    const abgeben = page.getByTestId('abgeben');
    await abgeben.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ergebnis')).toBeVisible();
    await expect(page.getByText('von 9 Punkten')).toBeVisible();
  });

  test('Richtig/Falsch ist mit R und F beantwortbar', async ({ page }) => {
    await page.goto('/hoeren/1/?teil=1&modus=uebung');
    await expect(page.getByTestId('teil-runner')).toBeVisible();

    // Aufgabe 1 ist Richtig/Falsch, Aufgabe 2 ist MC — also mit R antworten,
    // zurücknavigieren (Pfeil oben) und mit F überschreiben.
    await page.keyboard.press('r');
    const ersteFrage = page.locator('#frage-1');
    await expect(ersteFrage.locator('[data-option="richtig"]')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('f');
    await expect(ersteFrage.locator('[data-option="falsch"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(ersteFrage.locator('[data-option="richtig"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Vor der Abgabe steht keine Erklärung und kein Belegzitat im sichtbaren Text', async ({ page }) => {
    await page.goto('/lesen/1/?teil=1');
    await expect(page.getByTestId('teil-runner')).toBeVisible();

    const sichtbar = await page.locator('body').innerText();
    const ersteFrage = lesenUnit01.teile[0].fragen[0];
    expect(sichtbar).not.toContain(ersteFrage.explain_de);
    expect(sichtbar).not.toContain('Erklärung / Penjelasan');
    expect(sichtbar).not.toContain('Lösung:');
    expect(sichtbar).not.toContain('✓ Richtig');
  });
});

test.describe('Farbschema und Schriftgröße', () => {
  test('Dunkelmodus überlebt das Neuladen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Farbschema umschalten' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('Schriftgröße lässt sich dreistufig schalten', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('html');
    await page.getByRole('button', { name: 'Schrift vergrößern' }).click();
    await expect(root).toHaveClass(/fs-gross/);
    await page.reload();
    await expect(root).toHaveClass(/fs-gross/);
    await page.getByRole('button', { name: 'Schrift verkleinern' }).click();
    await page.getByRole('button', { name: 'Schrift verkleinern' }).click();
    await expect(root).toHaveClass(/fs-klein/);
  });
});
