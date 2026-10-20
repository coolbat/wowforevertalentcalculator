import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface LegacyShare {
  classId: string;
  label: string;
  payload: string;
}

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'public/data/manifest.json'), 'utf8'),
) as { gameBuild: string };

const shares = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/fixtures/legacy-share-urls.json'), 'utf8'),
) as LegacyShare[];

function share(classId: string, label: string): LegacyShare {
  const found = shares.find((item) => item.classId === classId && item.label === label);
  if (!found) throw new Error(`missing ${classId} ${label}`);
  return found;
}

function nodeButton(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}, rank`) });
}

async function openLegacy(page: Page, item: LegacyShare) {
  await page.goto(`/${item.classId}/#b=${item.payload}`);
  await expect(page.getByTestId('error-panel')).toHaveCount(0);
  await expect(page.getByTestId('external-banner')).toBeVisible();
  await expect(page.getByTestId('data-credit')).toContainText(
    `Data: beta build ${manifest.gameBuild} · upstream export`,
  );
  const credit = page.getByTestId('data-credit');
  await expect(credit.getByRole('link', { name: 'talentsforever.com' })).toHaveAttribute(
    'href',
    'https://talentsforever.com/',
  );
  await expect(credit.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
}

test('old paladin link refunds Improved Holy Strike', async ({ page }) => {
  await openLegacy(page, share('paladin', 'row0'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*51\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'Improved Holy Strike')).toHaveCount(0);
  await expect(page.getByTestId('migration-note')).toContainText('refunded');
});

test('old warrior link refunds removed Fury and Protection talents', async ({ page }) => {
  await openLegacy(page, share('warrior', 'removed-fury-and-prot'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*32\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'Improved Cleave')).toHaveCount(0);
  await expect(nodeButton(page, 'Boundless Rage')).toHaveCount(0);
  await expect(nodeButton(page, 'Toughness')).toHaveCount(0);
  await expect(nodeButton(page, 'Iron Will')).toHaveAccessibleName(/rank 4 of/);
  await expect(page.getByTestId('migration-note')).toContainText('refunded');
});

test('old mage link keeps Hot Streak points on Heating Up', async ({ page }) => {
  await openLegacy(page, share('mage', 'renamed-hot-streak'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*35\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'Hot Streak')).toHaveCount(0);
  await expect(nodeButton(page, 'Heating Up')).toHaveAccessibleName(/rank 1 of 1/);
  await expect(page.getByTestId('migration-note')).toContainText('renamed talents were kept');
});

test('old druid link keeps renamed feral talents and refunds King of the Jungle', async ({ page }) => {
  await openLegacy(page, share('druid', 'feral-removed-and-renamed'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*29\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'King of the Jungle')).toHaveCount(0);
  await expect(nodeButton(page, 'Mangle')).toHaveCount(0);
  await expect(nodeButton(page, 'Primal Bite')).toHaveAccessibleName(/rank 1 of 1/);
  await expect(nodeButton(page, 'Blood Frenzy')).toHaveAccessibleName(/rank 2 of 2/);
  await expect(nodeButton(page, 'Natural Instinct')).toHaveAccessibleName(/rank 2 of 2/);
});

test('old warlock link keeps Soul Harvest points', async ({ page }) => {
  await openLegacy(page, share('warlock', 'renamed-soul-harvesting'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*44\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'Soul Harvesting')).toHaveCount(0);
  await expect(nodeButton(page, 'Soul Harvest')).toHaveAccessibleName(/rank 2 of 2/);
});

test('old hunter link still opens', async ({ page }) => {
  await openLegacy(page, share('hunter', 'row0'));
  await expect(page.getByTestId('points-remaining')).toHaveText(/^\s*49\s*\/\s*51\s*$/);
  await expect(nodeButton(page, 'Deadly Aspects')).toHaveAccessibleName(/rank 2 of/);
});
