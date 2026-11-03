import { describe, expect, it } from 'vitest';
import { decodeBuild } from '../../src/domain/sharing/codec';
import { spentPoints, validateBuild } from '../../src/domain/talents/rules';
import {
  CLASS_ORDER,
} from '../../src/data/loadSnapshot';
import {
  LEVELING_EDITORIAL,
  collapsePicks,
  generateLevelingBuild,
  phaseSlices,
} from '../../src/data/levelingBuilds';
import { loadRuleset, loadSnapshot } from '../helpers/snapshot';

const ruleset = loadRuleset();
const origin = 'https://wowforevertalentcalculator.com';

describe('generated leveling builds', () => {
  it.each(CLASS_ORDER)('%s build is legal, complete and shareable', (classId) => {
    const snapshot = loadSnapshot(classId);
    const result = generateLevelingBuild(snapshot, ruleset, classId, origin);

    // Every class has editorial config pointing at a real tree.
    expect(LEVELING_EDITORIAL[classId].treeId).toBe(result.treeId);

    // The exact build the share link carries passes the rules engine.
    const validation = validateBuild(result.build, snapshot, ruleset);
    expect(validation.errors).toEqual([]);
    expect(spentPoints(result.build.allocation)).toBe(ruleset.maxBudget);

    // Take order covers every point at the right character level.
    expect(result.picks).toHaveLength(ruleset.maxBudget);
    result.picks.forEach((pick, index) => {
      expect(pick.order).toBe(index + 1);
      expect(pick.levelGained).toBe(ruleset.pointsStartLevel - 1 + index + 1);
      expect(pick.ranksTaken).toBeLessThanOrEqual(pick.maxRank);
    });
    const finalRanks: Record<string, number> = {};
    for (const pick of result.picks) {
      finalRanks[pick.talentId] = pick.ranksTaken;
    }
    expect(finalRanks).toEqual(result.build.allocation);

    // Primary tree gets the lion's share; phases partition every pick.
    const primaryPoints = Object.entries(result.build.allocation)
      .filter(([id]) => snapshot.talents.find((t) => t.talentId === id)?.treeId === result.treeId)
      .reduce((sum, [, rank]) => sum + rank, 0);
    expect(primaryPoints).toBeGreaterThanOrEqual(30);

    const phases = phaseSlices(result.picks);
    expect(phases.early.length + phases.mid.length + phases.late.length).toBe(ruleset.maxBudget);
    expect(collapsePicks(phases.early).length).toBeLessThanOrEqual(phases.early.length);

    // Share payload round-trips into the same legal build.
    const decoded = decodeBuild(result.sharePayload, [snapshot.snapshotId], ruleset);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.build.allocation).toEqual(result.build.allocation);
      expect(validateBuild(decoded.build, snapshot, ruleset).valid).toBe(true);
    }
    expect(result.shareUrl).toBe(`${origin}/${classId}/#b=${result.sharePayload}`);
  });

  it('is deterministic across regenerations', () => {
    for (const classId of CLASS_ORDER) {
      const snapshot = loadSnapshot(classId);
      const a = generateLevelingBuild(snapshot, ruleset, classId, origin);
      const b = generateLevelingBuild(snapshot, ruleset, classId, origin);
      expect(a.sharePayload).toBe(b.sharePayload);
      expect(a.picks.map((p) => p.talentId)).toEqual(b.picks.map((p) => p.talentId));
    }
  });
});
