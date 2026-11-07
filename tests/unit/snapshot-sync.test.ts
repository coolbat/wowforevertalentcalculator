import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataBuildLine, rankCoverageLine } from '../../src/data/credit';
import { talentRegistry } from '../../src/data/talentRegistry';
import type { ClassSnapshot, TalentNode } from '../../src/domain/talents/types';
import { loadManifest, loadSnapshot } from '../helpers/snapshot';

const manifest = loadManifest();
const root = path.resolve(__dirname, '../..');
const rawBytes = readFileSync(path.join(root, 'data-raw/talentsforever-data.json'));
const raw = JSON.parse(rawBytes.toString('utf8'));
const upstreamMeta = JSON.parse(
  readFileSync(path.join(root, 'data-raw/upstream-meta.json'), 'utf8'),
);

function talent(snapshot: ClassSnapshot, name: string): TalentNode | undefined {
  return snapshot.talents.find((node) => node.name === name);
}

describe('manifest is derived from the raw upstream export', () => {
  it('records the build, dates, license, hash, and the previous snapshots', () => {
    const build = /\b1\.\d+\.\d+\.(\d+)\b/.exec(raw.talents.Warrior.source)?.[1];
    expect(build).toBeTruthy();
    expect(manifest.gameBuild).toBe(build);
    expect(manifest.sources[0]).toMatchObject({
      url: 'https://talentsforever.com/data.json',
      recordedAt: raw.generated,
      license: 'CC-BY-4.0',
    });
    expect(manifest.checkedAt).toBe(upstreamMeta.checkedAt);
    expect(manifest.publishedAt).toBe(upstreamMeta.checkedAt);
    expect(manifest.sourceFileSha256).toBe(upstreamMeta.sha256);
    expect(createHash('sha256').update(rawBytes).digest('hex')).toBe(upstreamMeta.sha256);
    // Every earlier published snapshot stays openable.
    expect(manifest.legacySnapshotIds).toContain('snap-ce4da8695e9d');
    expect(manifest.legacySnapshotIds).toContain('snap-29c345bcd595');
    expect(manifest.legacySnapshotIds).not.toContain(manifest.snapshotId);
    expect(manifest.ruleset.maxLevel).toBe(60);
    expect(manifest.ruleset.maxBudget).toBe(51);
  });

  it('has recorded text for every rank, and the counts add up', () => {
    const cov = manifest.coverage;
    expect(cov.ranksTotal).toBeGreaterThan(1000);
    expect(cov.ranksWithText).toBe(cov.ranksTotal);
    expect(cov.ranksUnknown).toBe(0);
    expect(cov.ranksCommunityRecorded + cov.ranksSourceEstimate + cov.ranksUnknown).toBe(
      cov.ranksTotal,
    );
    let total = 0;
    let withText = 0;
    for (const file of manifest.classes) {
      const snapshot = loadSnapshot(file.classId);
      for (const t of snapshot.talents) {
        for (const r of t.rankEffects) {
          total += 1;
          if (r.text !== null) withText += 1;
        }
      }
    }
    expect({ total, withText }).toEqual({ total: cov.ranksTotal, withText: cov.ranksWithText });
  });

  it('derives the displayed data stamp and coverage line from the manifest', () => {
    const line = dataBuildLine(manifest);
    expect(line).toContain(`beta build ${manifest.gameBuild}`);
    expect(line).toContain('upstream export');
    expect(line).toContain('checked');
    expect(line).toContain('community export, not verified in-game');
    expect(rankCoverageLine(manifest.coverage.ranksWithText, manifest.coverage.ranksTotal)).toMatch(
      /^[\d,]+ of [\d,]+ ranks have recorded effect text$/,
    );
    expect(dataBuildLine({ ...manifest, gameBuild: null })).toBeNull();
  });
});

describe('talent aliases and class structure', () => {
  it('aliases renamed talents and keeps removed ids without a target', () => {
    expect(talentRegistry['druid:mangle']).toMatchObject({
      status: 'renamed',
      aliasOf: 'druid:primal-bite',
    });
    expect(talentRegistry['druid:primal-fury']).toMatchObject({
      status: 'renamed',
      aliasOf: 'druid:blood-frenzy',
    });
    expect(talentRegistry['druid:predatory-instincts']).toMatchObject({
      status: 'renamed',
      aliasOf: 'druid:natural-instinct',
    });
    expect(talentRegistry['mage:hot-streak']).toMatchObject({
      status: 'renamed',
      aliasOf: 'mage:heating-up',
    });
    expect(talentRegistry['warlock:soul-harvesting']).toMatchObject({
      status: 'renamed',
      aliasOf: 'warlock:soul-harvest',
    });
    for (const id of [
      'warrior:improved-cleave',
      'warrior:boundless-rage',
      'warrior:precision',
      'warrior:toughness',
      'warrior:vitality',
      'paladin:improved-holy-strike',
      'paladin:crusade',
      'druid:king-of-the-jungle',
    ]) {
      expect(talentRegistry[id], id).toMatchObject({ status: 'removed', aliasOf: null });
    }
    expect(talentRegistry['mage:wake-of-fire']).toMatchObject({
      status: 'renamed',
      aliasOf: 'mage:improved-fire-blast',
    });
    expect(talentRegistry['shaman:improved-fire-nova']).toMatchObject({
      status: 'renamed',
      aliasOf: 'shaman:trial-by-fire',
    });
    for (const id of [
      'shaman:call-of-thunder',
      'priest:improved-fade',
      'priest:shadow-affinity',
      'warlock:malediction',
    ]) {
      expect(talentRegistry[id], id).toMatchObject({ status: 'removed', aliasOf: null });
    }
    for (const id of [
      'mage:improved-fire-blast',
      'mage:arcane-wrath',
      'shaman:trial-by-fire',
      'shaman:elemental-mastery',
      'priest:dark-inspiration',
      'warlock:grim-reach',
    ]) {
      expect(talentRegistry[id], id).toMatchObject({ status: 'active', aliasOf: null });
    }
    // No alias points at another alias or at a talent that is gone.
    for (const [id, entry] of Object.entries(talentRegistry)) {
      if (entry.status !== 'renamed') continue;
      expect(entry.aliasOf, id).toBeTruthy();
      expect(talentRegistry[entry.aliasOf as string]?.status, id).toBe('active');
    }
    expect(talentRegistry['druid:primal-bite']).toMatchObject({ status: 'active', aliasOf: null });
    expect(talentRegistry['warrior:iron-will']).toMatchObject({
      status: 'active',
      sourceTree: 'Protection',
    });
  });

  it('matches the class-page sentences for removed and renamed talents', () => {
    const warrior = loadSnapshot('warrior');
    const paladin = loadSnapshot('paladin');
    const druid = loadSnapshot('druid');
    const mage = loadSnapshot('mage');
    const warlock = loadSnapshot('warlock');
    const hunter = loadSnapshot('hunter');
    const shaman = loadSnapshot('shaman');

    for (const name of ['Improved Cleave', 'Boundless Rage', 'Precision', 'Toughness', 'Vitality']) {
      expect(talent(warrior, name), name).toBeUndefined();
    }
    expect(talent(warrior, 'Lingering Rage')).toMatchObject({ row: 1 });
    expect(talent(warrior, 'Furious Precision')?.rankEffects.map((rank) => rank.text)).toEqual([
      'Increases your chance to hit with off-hand attacks by 4%.',
      'Increases your chance to hit with off-hand attacks by 7%.',
      'Increases your chance to hit with off-hand attacks by 10%.',
    ]);
    expect(talent(warrior, 'Furious Precision')?.row).toBe(2);
    const gore = talent(warrior, 'Gore Drinker');
    expect(gore?.row).toBe(5);
    expect(gore?.prerequisites).toEqual([{ talentId: 'warrior:enrage', requiredRank: 1 }]);
    const ironWill = talent(warrior, 'Iron Will');
    expect(ironWill?.treeId).toBe('warrior:protection');
    expect(ironWill?.row).toBe(0);
    expect(talent(warrior, 'Impale')?.prerequisites).toEqual([
      { talentId: 'warrior:deep-wounds', requiredRank: 1 },
    ]);
    expect(talent(warrior, 'Focused Rage')).toMatchObject({ row: 4, column: 2 });
    expect(talent(warrior, 'Bastion')).toMatchObject({ row: 5, column: 2 });

    expect(talent(paladin, 'Improved Holy Strike')).toBeUndefined();
    expect(talent(paladin, 'Crusade')).toBeUndefined();
    expect(talent(paladin, 'Holy Shield')?.rankEffects[0]?.text).toContain(
      'Increases chance to block by 30%',
    );
    expect(talent(paladin, 'Redoubt')?.rankEffects[0]?.text).toContain('block by 4%');

    for (const name of ['Mangle', 'Primal Fury', 'King of the Jungle', 'Predatory Instincts']) {
      expect(talent(druid, name), name).toBeUndefined();
    }
    expect(talent(druid, 'Primal Bite')).toMatchObject({
      row: 3,
      column: 1,
      prerequisites: [{ talentId: 'druid:savage-fury', requiredRank: 1 }],
    });
    expect(talent(druid, 'Blood Frenzy')).toMatchObject({
      row: 3,
      column: 3,
      prerequisites: [{ talentId: 'druid:sharpened-claws', requiredRank: 1 }],
    });
    const instinct = talent(druid, 'Natural Instinct');
    expect(instinct).toMatchObject({ row: 4, column: 3 });
    expect(instinct?.rankEffects[0]?.text).toContain('by 10%');
    expect(instinct?.rankEffects[0]?.text).toContain('12% of your Intellect');
    expect(instinct?.rankEffects[1]?.text).toContain('by 20%');
    expect(instinct?.rankEffects[1]?.text).toContain('25% of your Intellect');

    expect(talent(mage, 'Hot Streak')).toBeUndefined();
    const heating = talent(mage, 'Heating Up');
    expect(heating).toMatchObject({
      row: 3,
      prerequisites: [{ talentId: 'mage:pyroblast', requiredRank: 1 }],
    });
    expect(heating?.rankEffects[0]?.text).toContain('within 20 sec');

    expect(talent(warlock, 'Soul Harvesting')).toBeUndefined();
    const harvest = talent(warlock, 'Soul Harvest');
    expect(harvest?.row).toBe(1);
    expect(harvest?.rankEffects[1]?.text).toContain('100%');

    expect(talent(hunter, 'Redoubt')).toBeUndefined();
    expect(shaman.trees.map((tree) => tree.name)).toContain('Elemental');
    expect(shaman.trees.map((tree) => tree.treeId)).toContain('shaman:elemental');
    // Build 70425 moved Elemental Alacrity to row 2 and re-pointed Elemental Fury.
    expect(talent(shaman, 'Elemental Alacrity')?.row).toBe(1);
    expect(talent(shaman, 'Call of Thunder')).toBeUndefined();
    expect(talent(shaman, 'Elemental Fury')).toMatchObject({
      row: 5,
      prerequisites: [{ talentId: 'shaman:lightning-overload', requiredRank: 1 }],
    });
    expect(talent(shaman, 'Trial by Fire')).toMatchObject({ row: 3, column: 0 });
    expect(talent(loadSnapshot('mage'), 'Improved Fire Blast')).toMatchObject({
      row: 0,
      column: 0,
      maxRank: 2,
    });
    expect(talent(loadSnapshot('mage'), 'Wake of Fire')).toBeUndefined();
  });
});
