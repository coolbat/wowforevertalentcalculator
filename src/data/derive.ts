/**
 * Presentation helpers for Astro pages: evidence labels, Classic-change
 * statistics, and formatting shared by the calculator, reference, changes,
 * and sources pages.
 */
import type {
  ClassSnapshot,
  DatasetManifest,
  EvidenceStatus,
  RankEffect,
  TalentNode,
  TalentTree,
} from '@domain/talents/types';

export const EVIDENCE_BADGE: Record<EvidenceStatus, string> = {
  official: 'Official',
  client_verified: 'Client verified',
  footage_verified: 'Footage verified',
  community_recorded: 'Community record',
  source_estimate: 'Source estimate',
  unverified: 'Unverified',
  unknown: 'Unknown',
};

export interface EvidenceDefinition {
  status: EvidenceStatus;
  label: string;
  definition: string;
}

export const EVIDENCE_DEFINITIONS: EvidenceDefinition[] = [
  {
    status: 'official',
    label: 'Official',
    definition:
      'The fact is confirmed directly by officially published material.',
  },
  {
    status: 'client_verified',
    label: 'Client verified',
    definition:
      'We checked this field against a specific game client build ourselves.',
  },
  {
    status: 'footage_verified',
    label: 'Footage verified',
    definition:
      'We checked the claim against recorded footage or screenshots, with timestamps.',
  },
  {
    status: 'community_recorded',
    label: 'Community record',
    definition:
      'Transcribed by the community; we have not independently verified the original footage.',
  },
  {
    status: 'source_estimate',
    label: 'Source estimate',
    definition: 'Estimated by the data source itself, not measured in-game.',
  },
  {
    status: 'unverified',
    label: 'Unverified',
    definition: 'Effect text exists, but its evidence status is unclear.',
  },
  {
    status: 'unknown',
    label: 'Unknown',
    definition: 'No effect text is available for this rank.',
  },
];

export type ClassicStatus = NonNullable<TalentNode['classic']>['status'];

export const CLASSIC_STATUS_LABELS: Record<ClassicStatus, string> = {
  unchanged: 'Unchanged from Classic',
  changed: 'Changed from Classic',
  moved: 'Moved from Classic',
  removed: 'Removed in Forever',
  new: 'New in Forever',
  unknown: 'Classic status unknown',
};

export type ChangeStats = Record<ClassicStatus, number>;

export function classChangeStats(snapshot: ClassSnapshot): ChangeStats {
  const stats: ChangeStats = {
    unchanged: 0,
    changed: 0,
    moved: 0,
    removed: 0,
    new: 0,
    unknown: 0,
  };
  for (const talent of snapshot.talents) {
    stats[talent.classic?.status ?? 'unknown'] += 1;
  }
  return stats;
}

export function removedClassicCount(snapshot: ClassSnapshot): number {
  return snapshot.trees.reduce((n, tree) => n + tree.removedClassic.length, 0);
}

export function treeTalents(
  snapshot: ClassSnapshot,
  tree: TalentTree,
): TalentNode[] {
  const byId = new Map(snapshot.talents.map((t) => [t.talentId, t]));
  return tree.talentIds
    .map((id) => byId.get(id))
    .filter((t): t is TalentNode => t !== undefined)
    .sort((a, b) => a.row - b.row || a.column - b.column);
}

export function rankCoverage(snapshot: ClassSnapshot): {
  withText: number;
  total: number;
} {
  let withText = 0;
  let total = 0;
  for (const talent of snapshot.talents) {
    for (const rank of talent.rankEffects) {
      total += 1;
      if (rank.text !== null) withText += 1;
    }
  }
  return { withText, total };
}

/**
 * Splits a talent's ranks into the ones with confirmed effect text (rendered
 * in full) and the ones without (collapsed into a single summary line, so
 * repeated "not yet confirmed" placeholders don't dominate the page body).
 */
export function splitRanksByText(talent: TalentNode): {
  confirmed: RankEffect[];
  unknownRanks: number[];
} {
  const confirmed: RankEffect[] = [];
  const unknownRanks: number[] = [];
  for (const rank of talent.rankEffects) {
    if (rank.text !== null) confirmed.push(rank);
    else unknownRanks.push(rank.rank);
  }
  return { confirmed, unknownRanks };
}

/** [2, 3, 4, 6] → "2–4, 6" */
export function formatRankRanges(ranks: number[]): string {
  const sorted = [...ranks].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const r of sorted.slice(1)) {
    if (r === prev + 1) {
      prev = r;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = r;
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges.join(', ');
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function stageLabel(stage: DatasetManifest['stage']): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

// ---------- Local icon assets (see ASSETS.md) ----------

export function classIconUrl(iconRef: string): string {
  return `/icons/classes/${iconRef}.jpg`;
}

export function talentIconUrl(iconRef: string): string {
  return `/icons/talents/${iconRef}.jpg`;
}

/**
 * Tree icons are not stored in the snapshot model; names come from the
 * talentsforever.com raw export (see scripts/data/fetch-icons.mjs).
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
