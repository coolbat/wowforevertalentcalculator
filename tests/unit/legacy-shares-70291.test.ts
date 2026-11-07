import { describe, expect, it } from 'vitest';
import { decodeBuild, encodeBuild } from '../../src/domain/sharing/codec';
import { allowedSnapshotIds, migrateBuild } from '../../src/domain/sharing/migrate';
import { spentPoints, validateBuild } from '../../src/domain/talents/rules';
import { talentRegistry } from '../../src/data/talentRegistry';
import type { Allocation, Build, ClassSnapshot } from '../../src/domain/talents/types';
import { loadManifest, loadRuleset, loadSnapshot } from '../helpers/snapshot';

/**
 * Share links made on the 2026-10-15 snapshot (beta build 70291, snap-29c345bcd595)
 * must still open after the build 70425 sync. Allocations use the old talent
 * IDs; the legacy fixture file only covers the 2026-09-15 snapshot.
 */
const OLD_SNAPSHOT_ID = 'snap-29c345bcd595';
const manifest = loadManifest();
const ruleset = loadRuleset();

function oldBuild(classId: string, allocation: Allocation, level = 60): Build {
  return {
    classId,
    level,
    budgetProfile: 'standard',
    schemaVersion: 1,
    snapshotId: OLD_SNAPSHOT_ID,
    rulesetId: ruleset.rulesetId,
    allocation,
  };
}

function open(build: Build) {
  const payload = encodeBuild(build);
  const decoded = decodeBuild(payload, allowedSnapshotIds(manifest), ruleset);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.error.message);
  const snapshot = loadSnapshot(build.classId);
  const migrated = migrateBuild(decoded.build, manifest.snapshotId, talentRegistry, snapshot, ruleset);
  const validation = validateBuild(migrated.build, snapshot, ruleset);
  expect(validation.valid, validation.errors.map((e) => e.message).join('; ')).toBe(true);
  expect(migrated.build.snapshotId).toBe(manifest.snapshotId);
  return migrated;
}

/** Points on talents without prerequisites in rows above `row`, enough to open it. */
function fillAbove(snapshot: ClassSnapshot, treeId: string, row: number, skip: string[]): Allocation {
  const need = row * ruleset.pointsPerRowTier;
  const out: Allocation = {};
  let spent = 0;
  const candidates = snapshot.talents
    .filter((t) => t.treeId === treeId && t.row < row && t.prerequisites.length === 0)
    .filter((t) => !skip.includes(t.talentId))
    .sort((a, b) => a.row - b.row || a.column - b.column);
  for (const t of candidates) {
    if (spent >= need) break;
    const take = Math.min(t.maxRank, need - spent);
    out[t.talentId] = take;
    spent += take;
  }
  expect(spent).toBe(need);
  return out;
}

describe('legacy share urls from snap-29c345bcd595 (build 70291)', () => {
  it('lists that snapshot as openable', () => {
    expect(manifest.legacySnapshotIds).toContain(OLD_SNAPSHOT_ID);
    expect(allowedSnapshotIds(manifest)).toContain(OLD_SNAPSHOT_ID);
  });

  it('keeps Wake of Fire points on Improved Fire Blast', () => {
    const migrated = open(
      oldBuild('mage', { 'mage:wake-of-fire': 2, 'mage:improved-fireball': 5 }),
    );
    expect(migrated.build.allocation).toEqual({
      'mage:improved-fire-blast': 2,
      'mage:improved-fireball': 5,
    });
    expect(
      migrated.notes.some(
        (n) =>
          n.fromId === 'mage:wake-of-fire' &&
          n.toId === 'mage:improved-fire-blast' &&
          n.action === 'renamed',
      ),
    ).toBe(true);
  });

  it('keeps Improved Fire Nova points on Trial by Fire and refunds Call of Thunder', () => {
    const shaman = loadSnapshot('shaman');
    const allocation: Allocation = {
      ...fillAbove(shaman, 'shaman:elemental', 3, ['shaman:trial-by-fire']),
      'shaman:improved-fire-nova': 2,
      'shaman:call-of-thunder': 1,
    };
    const migrated = open(oldBuild('shaman', allocation));
    expect(migrated.build.allocation['shaman:trial-by-fire']).toBe(2);
    expect(migrated.build.allocation['shaman:improved-fire-nova'] ?? 0).toBe(0);
    expect(migrated.build.allocation['shaman:call-of-thunder'] ?? 0).toBe(0);
    expect(spentPoints(migrated.build.allocation)).toBe(15 + 2);
    expect(
      migrated.notes.some(
        (n) => n.fromId === 'shaman:call-of-thunder' && n.action === 'refunded',
      ),
    ).toBe(true);
  });

  it('refunds Improved Fade, Shadow Affinity and Malediction and keeps the rest', () => {
    const priest = open(
      oldBuild('priest', {
        'priest:improved-fade': 2,
        'priest:shadow-affinity': 3,
        'priest:blackout': 5,
      }),
    );
    expect(priest.build.allocation).toEqual({ 'priest:blackout': 5 });
    const warlock = open(
      oldBuild('warlock', { 'warlock:malediction': 5, 'warlock:suppression': 5 }),
    );
    expect(warlock.build.allocation).toEqual({ 'warlock:suppression': 5 });
  });

  it('opens a 2026-09-15 link and resolves renamed IDs to the current talent', () => {
    // wake-of-fire -> improved-fire-blast (build 70425). Hot Streak points need Pyroblast
    // first, so the validator may drop them; only the alias target is asserted here.
    const migrated = open({
      ...oldBuild('mage', { 'mage:hot-streak': 1, 'mage:wake-of-fire': 1 }),
      snapshotId: 'snap-ce4da8695e9d',
    });
    expect(migrated.build.allocation['mage:improved-fire-blast']).toBe(1);
    expect(migrated.build.allocation['mage:hot-streak'] ?? 0).toBe(0);
  });
});
