import { expect, test as base } from '@playwright/test';

/**
 * Test-Fixture: wartet nach JEDER Navigation, bis die Astro-Inseln hydriert sind.
 *
 * Grund (real gemessen, nicht theoretisch): vor der Hydration ist das server-gerenderte
 * HTML inert — fokussieren geht, aber Klick/Enter lösen nichts aus, weil der
 * Preact-Handler noch nicht gebunden ist. Ohne dieses Warten sind Tastatur-Tests
 * zufallsabhängig; danach prüfen sie wirklich die App.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const original = page.goto.bind(page);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (page as any).goto = async (url: string, options?: unknown) => {
      const antwort = await original(url, options as never);
      try {
        await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'), undefined, {
          timeout: 30_000
        });
      } catch {
        /* Seiten ohne Inseln (z. B. /quellen/) haben nichts zu hydrieren */
      }
      return antwort;
    };
    await use(page);
  }
});

export { expect };
