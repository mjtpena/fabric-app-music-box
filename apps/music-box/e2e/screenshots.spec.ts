/**
 * Redesign screenshots (not a test). Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Writes docs/redesign/<screen>-<theme>-<desktop|phone>.png.
 */
import { test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

const LEAD = 'demo-lead-morgan';
const OWNER = 'demo-owner-dana';

type Shot = { name: string; path: string; persona: string; full?: boolean; reduced?: boolean; act?: (page: Page, phone: boolean) => Promise<void> };

const lens = (name: RegExp) => async (page: Page) => {
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name }).click();
};

const SHOTS: Shot[] = [
  { name: 'cylinder-3d', path: '/', persona: LEAD, reduced: false },
  { name: 'cylinder-roll', path: '/?nowebgl', persona: LEAD, reduced: true },
  { name: 'cylinder-channel', path: '/?nowebgl', persona: LEAD, reduced: true, act: lens(/Channel/) },
  { name: 'cylinder-unsub', path: '/?nowebgl', persona: LEAD, reduced: true, act: lens(/Unsubs/) },
  {
    name: 'cylinder-today-focus',
    path: '/?nowebgl',
    persona: LEAD,
    reduced: true,
    act: async (page, phone) => {
      if (phone) await page.getByRole('button', { name: /^Today/ }).click();
      await page.getByRole('button', { name: /VIP Winter Buyers over cap/ }).click();
    },
  },
  {
    name: 'cylinder-list',
    path: '/?nowebgl',
    persona: LEAD,
    full: true,
    reduced: true,
    act: async (page) => {
      await page.getByRole('radio', { name: 'List' }).click();
    },
  },
  { name: 'pinning', path: '/pinning', persona: OWNER, full: true, reduced: true },
  { name: 'comb', path: '/comb', persona: LEAD, full: true, reduced: true },
  { name: 'tuning-fork', path: '/tuning-fork', persona: LEAD, full: true, reduced: true },
  { name: 'stop', path: '/stop', persona: LEAD, full: true, reduced: true },
];

const only = process.env.SHOTS?.split(',').filter(Boolean);
const themes = (process.env.THEMES?.split(',').filter(Boolean) as ('light' | 'dark')[] | undefined) ?? ['light', 'dark'];

for (const scheme of themes) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const s of SHOTS) {
      test(`${s.name} ${scheme}`, async ({ page }, info) => {
        test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to write the redesign screenshots.');
        test.skip(!!only && !only.includes(s.name), 'not selected');
        const phone = info.project.name === 'phone';
        if (s.reduced !== false) {
          await page.emulateMedia({ reducedMotion: 'reduce' });
        }
        await openApp(page, s.path, s.persona);
        await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
        if (s.act) await s.act(page, phone);
        await page.waitForTimeout(900);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `docs/redesign/${s.name}-${scheme}-${phone ? 'phone' : 'desktop'}.png`,
          fullPage: !!s.full && !phone,
        });
      });
    }
  });
}
