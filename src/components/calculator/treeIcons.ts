/**
 * Tree icon mapping (/icons/trees/<icon>.jpg). The snapshot has no
 * tree-icon field; these file names come from the upstream data source
 * (data-raw/talentsforever-data.json, per-tree "icon" field), keyed by
 * the snapshot's stable treeId. priest:shadow is named "shadow-magic"
 * upstream. Missing entries simply render no tree icon.
 */
export const TREE_ICONS: Record<string, string> = {
  'warrior:arms': 'ability_rogue_eviscerate',
  'warrior:fury': 'ability_warrior_innerrage',
  'warrior:protection': 'ability_warrior_defensivestance',
  'paladin:holy': 'spell_holy_holybolt',
  'paladin:protection': 'spell_holy_devotionaura',
  'paladin:retribution': 'spell_holy_auraoflight',
  'hunter:beast-mastery': 'ability_hunter_beasttaming',
  'hunter:marksmanship': 'ability_marksmanship',
  'hunter:survival': 'ability_hunter_swiftstrike',
  'rogue:assassination': 'ability_rogue_eviscerate',
  'rogue:combat': 'ability_backstab',
  'rogue:subtlety': 'ability_stealth',
  'priest:discipline': 'spell_holy_wordfortitude',
  'priest:holy': 'spell_holy_holybolt',
  'priest:shadow': 'spell_shadow_shadowwordpain',
  'shaman:elemental': 'spell_nature_lightning',
  'shaman:elemental-combat': 'spell_nature_lightning',
  'shaman:enhancement': 'spell_nature_lightningshield',
  'shaman:restoration': 'spell_nature_magicimmunity',
  'mage:arcane': 'spell_holy_magicalsentry',
  'mage:fire': 'spell_fire_firebolt02',
  'mage:frost': 'spell_frost_frostbolt02',
  'warlock:affliction': 'spell_shadow_deathcoil',
  'warlock:demonology': 'spell_shadow_metamorphosis',
  'warlock:destruction': 'spell_shadow_rainoffire',
  'druid:balance': 'spell_nature_starfall',
  'druid:feral-combat': 'ability_racial_bearform',
  'druid:restoration': 'spell_nature_healingtouch',
};

export function treeIconUrl(treeId: string): string | null {
  const icon = TREE_ICONS[treeId];
  return icon ? `/icons/trees/${icon}.jpg` : null;
}
