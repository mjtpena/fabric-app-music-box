import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const LEAD = 'demo-lead-morgan';
const OWNER = 'demo-owner-dana';

test('smoke: loads centrepiece, pins a campaign, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/?nowebgl', LEAD);
  await expect(page.getByTestId('music-box-svg')).toBeVisible();
  await assertNoHorizontalScroll(page);

  await openApp(page, '/pinning', OWNER);
  await page.getByLabel(/Campaign name/).fill('Smoke Push Alert');
  await page.getByLabel('Channel').selectOption('push');
  await page.getByLabel('Audience size').fill('5000');
  await page.getByTestId('schedule-pin-btn').click();
  await expect(page.getByText(/Pinned "Smoke Push Alert"/)).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('centrepiece: lens switch, Today focus, list view fallback, and ?nowebgl render cleanly', async ({ page }, info) => {
  const consoleWatch = watchConsole(page);
  const phone = info.project.name === 'phone';
  await openApp(page, '/?nowebgl', LEAD);
  await expect(page.getByTestId('music-box-svg')).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Channel/ }).click();
  if (phone) await page.getByRole('button', { name: /^Today/ }).click();
  await page.getByRole('button', { name: /VIP Winter Buyers over cap/ }).click();
  if (phone) await page.keyboard.press('Escape');

  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('campaign-list')).toBeVisible();
  await expect(page.getByText('VIP Brassware Preview', { exact: true })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('AC1: 4th email to segment at 3 expected touches is blocked; lead can override with 20+ char reason', async ({ page }) => {
  // Holiday Gifters has 3 emails scheduled today -> E(email) = 3.0
  await openApp(page, '/pinning', OWNER);
  await page.getByLabel(/Campaign name/).fill('Fourth Gifter Email');
  await page.getByLabel('Channel').selectOption('email');
  await expect(page.getByTestId('cap-breach-alert')).toBeVisible();
  await page.getByTestId('schedule-pin-btn').click();
  await expect(page.getByText(/Cap exceeded:/i)).toBeVisible();

  // Messaging lead overrides with 20+ char reason
  await openApp(page, '/pinning', LEAD);
  await page.getByLabel(/Campaign name/).fill('Fourth Gifter Override');
  await page.getByLabel('Channel').selectOption('email');
  await page.getByLabel(/Cap override reason/).fill('Executive shipping deadline alert approved for Holiday Gifters.');
  await page.getByTestId('schedule-pin-btn').click();
  await expect(page.getByText(/Pinned "Fourth Gifter Override"/)).toBeVisible();
});

test('AC2: SMS local-time shows 06:10 Chicago wave as violation and blocks until shifted', async ({ page }) => {
  await openApp(page, '/pinning', OWNER);
  await page.getByLabel(/Campaign name/).fill('Early SMS Test');
  await page.getByLabel('Channel').selectOption('sms');
  await page.getByLabel('Send time (UTC)').fill('12:10');

  const chicagoWave = page.getByTestId('sms-wave-CT');
  await expect(chicagoWave).toContainText('06:10');
  await expect(chicagoWave).toHaveAttribute('data-violates', 'true');
  await expect(page.getByTestId('schedule-pin-btn')).toBeDisabled();

  // Shift send time to 16:10 UTC -> 10:10 CT (all zones 08:10-11:10)
  await page.getByLabel('Send time (UTC)').fill('16:10');
  await expect(chicagoWave).toHaveAttribute('data-violates', 'false');
  await expect(page.getByTestId('schedule-pin-btn')).toBeEnabled();
});

test('AC3: Campaign at 3x recent max volume is split into three waves', async ({ page }) => {
  await openApp(page, '/pinning', LEAD);
  await page.getByLabel(/Campaign name/).fill('Triple Volume Blast');
  await page.getByLabel('Channel').selectOption('email');
  // Select Lapsed 90-Day (last segment, no email cap breach) and 60,000 audience (3x 20,000 max)
  const segSelect = page.getByLabel('Target segment');
  const lapsedVal = await segSelect.locator('option', { hasText: 'Lapsed 90-Day' }).getAttribute('value');
  await segSelect.selectOption(lapsedVal!);
  await page.getByLabel('Audience size').fill('60000');
  await expect(page.getByTestId('warmup-preview')).toContainText('Wave 3');

  await page.getByTestId('schedule-pin-btn').click();
  await expect(page.getByText(/Split "Triple Volume Blast" into 3 warm-up waves/)).toBeVisible();
});

test('AC4: Paused campaign at 0.7% unsubscribes after 2,500 delivered cannot be resumed by owner', async ({ page }) => {
  await openApp(page, '/stop', OWNER);
  const row = page.getByTestId('paused-row-Lapsed Win-Back Blast');
  await expect(row).toContainText('2,500');
  await expect(row).toContainText('0.72%');
  await expect(page.getByTestId('resume-btn-Lapsed Win-Back Blast')).toBeDisabled();

  // Messaging lead can resume
  await openApp(page, '/stop', LEAD);
  await page.getByTestId('resume-btn-Lapsed Win-Back Blast').click();
  await expect(page.getByTestId('paused-row-Lapsed Win-Back Blast')).toHaveCount(0);
});

test('AC5: Two pins within 2 hours in overlapping rows glow amber and list view marks the same pair', async ({ page }) => {
  await openApp(page, '/?nowebgl', LEAD);
  await expect(page.getByTestId('collision-tie').first()).toBeVisible();
  const collidingPins = page.locator('[data-colliding="true"]');
  expect(await collidingPins.count()).toBeGreaterThanOrEqual(2);

  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('list-collision-badge').first()).toBeVisible();
});
