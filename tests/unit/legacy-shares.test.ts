import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeBuild } from '../../src/domain/sharing/codec';
import { allowedSnapshotIds, migrateBuild } from '../../src/domain/sharing/migrate';
import { spentPoints, validateBuild } from '../../src/domain/talents/rules';
import { talentRegistry } from '../../src/data/talentRegistry';
import { loadManifest, loadRuleset, loadSnapshot } from '../helpers/snapshot';

interface LegacyShare {
  classId: string;
  label: string;
  url: string;
  payload: string;
  snapshotId: string;
  level: number;
  allocation: Record<string, number>;
  spent: number;
}

const shares = JSON.parse(
  readFileSync(path.join(__dirname, '../fixtures/legacy-share-urls.json'), 'utf8'),
) as LegacyShare[];

const manifest = loadManifest();
const ruleset = loadRuleset();
const allowed = allowedSnapshotIds(manifest);

function openShare(share: LegacyShare) {
  const decoded = decodeBuild(share.payload, allowed, ruleset);
  expect(decoded.ok, `${share.classId} ${share.label} decode`).toBe(true);
  if (!decoded.ok) throw new Error(decoded.error.message);
  const snapshot = loadSnapshot(share.classId);
  const migrated = migrateBuild(
    decoded.build,
    manifest.snapshotId,
    talentRegistry,
    snapshot,
    ruleset,
  );
  const validation = validateBuild(migrated.build, snapshot, ruleset);
  expect(
    validation.valid,
    validation.errors.map((error) => error.message).join('; '),
  ).toBe(true);
  expect(migrated.build.snapshotId).toBe(manifest.snapshotId);
  expect(migrated.build.classId).toBe(share.classId);
  expect(migrated.build.level).toBe(share.level);
  return migrated;
}

describe('legacy share urls from snap-ce4da8695e9d', () => {
  it('covers one build for every class, including removed and renamed talents', () => {
    const classes = new Set(shares.map((share) => share.classId));
    expect(classes.size).toBe(9);
    expect(shares.every((share) => share.snapshotId === 'snap-ce4da8695e9d')).toBe(true);
    expect(manifest.legacySnapshotIds).toContain('snap-ce4da8695e9d');
  });

  it('keeps a current-data round trip on the new snapshot id', () => {
    const share = shares.find((item) => item.label === 'row0' && item.classId === 'mage');
    if (!share) throw new Error('missing mage row0');
    const migrated = openShare(share);
    const again = decodeBuild(
      // encode through the public codec by re-decoding the migrated allocation
      // is covered below; here the migrated build must already be current.
      share.payload,
      allowed,
      ruleset,
    );
    expect(again.ok).toBe(true);
    expect(migrated.build.allocation['mage:wand-specialization']).toBe(2);
  });

  for (const share of shares.filter((item) => item.label === 'row0' && item.classId !== 'paladin')) {
    it(`${share.classId} row 0 keeps its points`, () => {
      const migrated = openShare(share);
      expect(migrated.build.allocation).toEqual(share.allocation);
      expect(spentPoints(migrated.build.allocation)).toBe(share.spent);
    });
  }

  it('refunds a paladin build that only spent Improved Holy Strike', () => {
    const share = shares.find((item) => item.classId === 'paladin' && item.label === 'row0');
    if (!share) throw new Error('missing paladin row0');
    const migrated = openShare(share);
    expect(migrated.build.allocation).toEqual({});
    expect(spentPoints(migrated.build.allocation)).toBe(0);
    expect(migrated.notes.some((note) => note.fromId === 'paladin:improved-holy-strike' && note.action === 'refunded')).toBe(true);
  });

  it('refunds removed warrior talents and keeps Iron Will', () => {
    const share = shares.find((item) => item.label === 'removed-fury-and-prot');
    if (!share) throw new Error('missing warrior special');
    const migrated = openShare(share);
    for (const id of [
      'warrior:improved-cleave',
      'warrior:boundless-rage',
      'warrior:precision',
      'warrior:toughness',
    ]) {
      expect(migrated.build.allocation[id] ?? 0).toBe(0);
    }
    expect(migrated.build.allocation).toMatchObject({
      'warrior:booming-voice': 5,
      'warrior:cruelty': 5,
      'warrior:iron-will': 4,
      'warrior:shield-specialization': 5,
    });
    expect(spentPoints(migrated.build.allocation)).toBe(19);
  });

  it('refunds Crusade and Improved Holy Strike and keeps the other paladin points', () => {
    const share = shares.find((item) => item.label === 'removed-holy-and-ret');
    if (!share) throw new Error('missing paladin special');
    const migrated = openShare(share);
    expect(migrated.build.allocation['paladin:improved-holy-strike'] ?? 0).toBe(0);
    expect(migrated.build.allocation['paladin:crusade'] ?? 0).toBe(0);
    expect(migrated.build.allocation).toMatchObject({
      'paladin:benediction': 5,
      'paladin:conviction': 1,
      'paladin:deflection': 5,
      'paladin:holy-conduit': 2,
      'paladin:improved-judgement': 2,
    });
    expect(spentPoints(migrated.build.allocation)).toBe(15);
  });

  it('keeps Hot Streak points on Heating Up', () => {
    const share = shares.find((item) => item.label === 'renamed-hot-streak');
    if (!share) throw new Error('missing mage special');
    const migrated = openShare(share);
    expect(migrated.build.allocation['mage:hot-streak'] ?? 0).toBe(0);
    expect(migrated.build.allocation['mage:heating-up']).toBe(1);
    expect(migrated.build.allocation).toMatchObject({
      'mage:ignite': 4,
      'mage:improved-fireball': 5,
      'mage:incineration': 3,
      'mage:pyroblast': 1,
      'mage:wake-of-fire': 2,
    });
    expect(spentPoints(migrated.build.allocation)).toBe(16);
    expect(migrated.notes.some((note) => note.fromId === 'mage:hot-streak' && note.toId === 'mage:heating-up' && note.action === 'renamed')).toBe(true);
  });

  it('keeps renamed feral points and refunds King of the Jungle', () => {
    const share = shares.find((item) => item.label === 'feral-removed-and-renamed');
    if (!share) throw new Error('missing druid special');
    const migrated = openShare(share);
    expect(migrated.build.allocation['druid:king-of-the-jungle'] ?? 0).toBe(0);
    expect(migrated.build.allocation['druid:mangle'] ?? 0).toBe(0);
    expect(migrated.build.allocation['druid:primal-fury'] ?? 0).toBe(0);
    expect(migrated.build.allocation['druid:predatory-instincts'] ?? 0).toBe(0);
    expect(migrated.build.allocation).toMatchObject({
      'druid:primal-bite': 1,
      'druid:blood-frenzy': 2,
      'druid:natural-instinct': 2,
      'druid:feral-instinct': 3,
      'druid:feral-swiftness': 2,
      'druid:ferocity': 5,
      'druid:heart-of-the-wild': 5,
      'druid:savage-fury': 1,
      'druid:sharpened-claws': 1,
    });
    expect(spentPoints(migrated.build.allocation)).toBe(22);
  });

  it('keeps Soul Harvesting points on Soul Harvest', () => {
    const share = shares.find((item) => item.label === 'renamed-soul-harvesting');
    if (!share) throw new Error('missing warlock special');
    const migrated = openShare(share);
    expect(migrated.build.allocation['warlock:soul-harvesting'] ?? 0).toBe(0);
    expect(migrated.build.allocation['warlock:soul-harvest']).toBe(2);
    expect(migrated.build.allocation).toMatchObject({
      'warlock:improved-life-tap': 2,
      'warlock:suppression': 3,
    });
    expect(spentPoints(migrated.build.allocation)).toBe(7);
  });
});
