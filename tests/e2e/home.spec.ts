import { expect, test } from '@playwright/test';

/** Premium tool page: the calculator is usable on the home page itself. */

test('home page: tool usable in first screen without navigation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Default class (warrior) calculator is right there — no click needed.
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*51\s*\/\s*51\s*$/);
  const node = page.getByRole('button', { name: /^Improved Heroic Strike, rank/ });
  await node.click();
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*50\s*\/\s*51\s*$/);
  expect(page.url()).toMatch(/localhost:4321\/$/);

  // Switch class in-page: shaman loads without leaving the home page.
  await page.getByTestId('home-class-tab-shaman').click();
  await expect(page.getByTestId('home-class-tab-shaman')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*51\s*\/\s*51\s*$/);
  expect(page.url()).toMatch(/localhost:4321\/$/);
  // Shaman tree is rendered (no Warrior talents).
  await expect(page.getByRole('button', { name: /^Improved Heroic Strike,/ })).toHaveCount(0);

  // Switch back to warrior: the draft (1 point) is still there.
  await page.getByTestId('home-class-tab-warrior').click();
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*50\s*\/\s*51\s*$/);
});

test('home page: exactly one H1 and tool present in initial HTML shell', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  expect(html).toContain('WoW Forever Talent Calculator');
});
