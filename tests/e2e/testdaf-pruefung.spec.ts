import { expect, test } from './fixtures';

/**
 * Abnahmekriterium: Im TestDaF-Modul darf die Prüfungszeit niemanden aufhalten.
 * Jeder Prüfungsteil lässt sich sofort abschließen, und wenn die Uhr abläuft,
 * wird nichts gesperrt und nichts automatisch beendet.
 */
test.describe('TestDaF-Prüfungssimulation: jederzeit weiter, ohne Warten', () => {
  test('Leseverstehen sofort beenden → Hörverstehen → Ergebnis, ohne eine einzige Antwort', async ({ page }) => {
    await page.goto('/testdaf/pruefung/1/');
    await page.getByTestId('pruefung-starten').click();

    // Der Weiter-Knopf steht ab der ersten Sekunde bereit — kein Warten auf die Uhr:
    const weiter = page.getByTestId('teil-beenden');
    await expect(weiter).toBeVisible();
    await expect(weiter).toBeEnabled();
    await expect(page.getByTestId('testdaf-timer')).not.toContainText('Zeit abgelaufen');

    await weiter.click();
    await expect(page.getByTestId('hoeren-starten')).toBeVisible();

    await page.getByTestId('hoeren-starten').click();
    // Hörverstehen: Audioplayer ist sofort da (keine Sperre durch Vorbereitungszeit)
    await expect(page.getByTestId('testdaf-player-a1')).toBeVisible();
    await expect(page.getByTestId('teil-beenden')).toBeEnabled();

    await page.getByTestId('teil-beenden').click();
    await expect(page.getByRole('heading', { name: /Prüfung beendet/ })).toBeVisible();
    // Alles unbeantwortet → 0 von 30 bzw. 0 von 25 Punkten, nichts stumm verschluckt:
    await expect(page.getByText('0 von 30 Punkten')).toBeVisible();
    await expect(page.getByText('0 von 25 Punkten')).toBeVisible();
    await expect(page.getByText('30 unbeantwortet')).toBeVisible();
    await expect(page.getByText('25 unbeantwortet')).toBeVisible();
  });

  test('Zeitablauf sperrt nichts und beendet nichts von selbst (faktor=0.001)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/testdaf/pruefung/1/?faktor=0.001');
    await page.getByTestId('pruefung-starten').click();

    await expect(page.getByTestId('zeit-ueberzogen')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('testdaf-timer')).toContainText('Zeit abgelaufen');
    // Kein automatischer Wechsel: der Teil läuft weiter, die Aufgaben bleiben bedienbar
    await expect(page.getByTestId('hoeren-starten')).toHaveCount(0);
    await expect(page.getByTestId('testdaf-runner')).toBeVisible();
    await expect(page.getByTestId('abgeben')).toBeEnabled();

    // Und danach geht es sofort per Klick in den nächsten Teil:
    await page.getByTestId('teil-beenden').click();
    await expect(page.getByTestId('hoeren-starten')).toBeVisible();
  });
});
