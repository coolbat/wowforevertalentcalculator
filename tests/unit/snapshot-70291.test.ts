import { describe, expect, it } from 'vitest';
import { talentRegistry } from '../../src/data/talentRegistry';
import type { ClassSnapshot, TalentNode } from '../../src/domain/talents/types';
import { loadManifest, loadSnapshot } from '../helpers/snapshot';

const manifest = loadManifest();

function talent(snapshot: ClassSnapshot, name: string): TalentNode | undefined {
  return snapshot.talents.find((node) => node.name === name);
}

describe('beta build 70291 manifest and aliases', () => {
  it('records the upstream build, dates, license, and the previous snapshot', () => {
    expect(manifest.gameBuild).toBe('70291');
    expect(manifest.publishedAt).toBe('2026-10-15');
    expect(manifest.sources[0]).toMatchObject({
      url: 'https://talentsforever.com/data.json',
      recordedAt: '2026-10-14',
      license: 'CC-BY-4.0',
    });
    expect(manifest.legacySnapshotIds).toContain('snap-ce4da8695e9d');
    expect(manifest.legacySnapshotIds).not.toContain(manifest.snapshotId);
    expect(manifest.ruleset.maxLevel).toBe(60);
    expect(manifest.ruleset.maxBudget).toBe(51);
  });

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
    expect(talent(shaman, 'Elemental Alacrity')?.row).toBe(2);
    expect(talent(shaman, 'Elemental Fury')).toMatchObject({
      row: 5,
      prerequisites: [{ talentId: 'shaman:call-of-thunder', requiredRank: 1 }],
    });
  });
});
