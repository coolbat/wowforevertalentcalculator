/**
 * Class-page sentences checked against the snapshot data (still true for beta
 * builds 70291 and 70425). Re-check them when a sync changes the talents named here.
 * Rows and columns are 1-based, the same numbering the talent reference uses.
 */
export const CLASS_SNAPSHOT_NOTES: Partial<Record<string, readonly string[]>> = {
  warrior: [
    'This snapshot does not include the Fury talents Improved Cleave, Boundless Rage, or Precision, or the Protection talents Toughness and Vitality.',
    'Fury includes Lingering Rage in row 2, Furious Precision in row 3 (off-hand hit 4%, 7%, and 10%), and Gore Drinker in row 6, which requires Enrage.',
    'Iron Will is in Protection row 1. Impale requires Deep Wounds. Focused Rage is in Protection row 5. Bastion stays in Protection row 6.',
  ],
  paladin: [
    'Improved Holy Strike and Crusade are not in this snapshot.',
    "Holy Shield's rank text increases chance to block by 30%. Holy Strike spell ranks in this dataset list a 10 sec cooldown.",
  ],
  druid: [
    'Mangle, Primal Fury, King of the Jungle, and Predatory Instincts are not in this snapshot.',
    'Primal Bite is in Feral Combat row 4 and requires Savage Fury. Blood Frenzy is in Feral Combat row 4 and requires Sharpened Claws.',
    'Natural Instinct is in Feral Combat row 5, column 4. Rank 1 increases the critical strike damage bonus of melee abilities by 10% and spell healing by 12% of Intellect. Rank 2 uses 20% and 25%.',
  ],
  mage: [
    'Hot Streak is not in this snapshot. Heating Up is in Fire row 4 and requires Pyroblast. Its rank text reduces the cast time of the next Pyroblast cast within 20 sec.',
  ],
  warlock: [
    'Soul Harvesting is not in this snapshot. Soul Harvest is in Affliction row 2. Rank 2 increases Mana regeneration by 100% for 10 sec and allows 100% of normal Mana regeneration to continue while casting.',
  ],
};
