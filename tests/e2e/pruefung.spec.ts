import { expect, test } from './fixtures';

/** Abnahmekriterien: Wiedergabegrenze im Prüfungsmodus + automatische Sperre im Modelltest. */
test.describe('Prüfungsregeln', () => {
  test('Prüfungsmodus: Audio ist nach der erlaubten Wiedergabe gesperrt (kein Seek, keine Pause)', async ({ page }) => {
    await page.goto('/hoeren/1/?teil=1&modus=pruefung');
    await expect(page.getByTestId('teil-runner')).toBeVisible();

    const ueberspringen = page.getByRole('button', { name: 'Überspringen' });
    if (await ueberspringen.isVisible()) await ueberspringen.click();

    await expect(page.getByTestId('player-status')).toContainText('von 1');
    await expect(page.getByTestId('seek')).toHaveCount(0);
    await expect(page.getByTestId('loop-a')).toHaveCount(0);

    await page.getByTestId('play').click();
    await expect(page.getByTestId('player-gesperrt')).toBeVisible();
    await expect(page.getByTestId('pause')).toHaveCount(0);
    await expect(page.getByTestId('play')).toBeDisabled();
  });

  test('Übungsmodus: Transkript sichtbar, A–B-Schleife und Tempo vorhanden', async ({ page }) => {
    await page.goto('/hoeren/1/?teil=1&modus=uebung');
    await expect(page.getByTestId('seek')).toBeVisible();
    await expect(page.getByTestId('loop-a')).toBeVisible();
    await expect(page.getByTestId('tempo')).toBeVisible();
    await expect(page.getByTestId('player-teil1')).toBeVisible();
    // Transkript aus dem eigenen Audio: viele klickbare Wörter
    const woerter = page.locator('.transkript .wort');
    expect(await woerter.count()).toBeGreaterThan(100);
  });

  test('Modelltest: Zeitablauf sperrt jeden Teil automatisch, danach kommt der Bericht', async ({ page }) => {
    test.setTimeout(240_000);
    // faktor=0.001 → jeder Teil dauert 1 s; autostart überspringt den Startdialog
    await page.goto('/pruefung/pruefung-01/?faktor=0.001&autostart=1');
    await expect(page.getByTestId('pruefung-kopf')).toBeVisible();
    await expect(page.getByTestId('pruefung-timer')).toBeVisible();
    await expect(page.getByTestId('zeit-gesperrt')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pruefung-bericht')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole('heading', { name: /Prüfungsbericht/ })).toBeVisible();
    await expect(page.getByText(/unbeantwortet/).first()).toBeVisible();
    await expect(page.getByTestId('drucken')).toBeVisible();
  });

  test('Modelltest: Antwortschlüssel erscheinen erst im Bericht', async ({ page }) => {
    await page.goto('/pruefung/pruefung-01/');
    await expect(page.getByTestId('pruefung-starten')).toBeVisible();
    const vorher = await page.locator('body').innerText();
    expect(vorher).not.toContain('Erklärung / Penjelasan');
    expect(vorher).not.toContain('Fehler mit Beleg');
  });
});
