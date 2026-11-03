/**
 * Data-driven leveling builds for the /builds/{class}-leveling-build/ pages.
 *
 * The allocation is generated deterministically at build time by the same
 * rules engine the calculator uses (applyAction validates every point), so
 * the published spec and the share link are always legal for the current
 * snapshot. Scoring favors classic leveling value: damage, resource flow and
 * sustainability over threat/armor/healing stats. The pages present it as a
 * starting skeleton, not a meta claim.
 */
import { applyAction, emptyBuild, spentPoints, validateBuild } from '@domain/talents/rules';
import { encodeBuild } from '@domain/sharing/codec';
import type { Build, ClassSnapshot, Ruleset, TalentNode } from '@domain/talents/types';

export interface LevelingPick {
  talentId: string;
  name: string;
  treeId: string;
  row: number; // 0-based
  column: number; // 0-based
  ranksTaken: number;
  maxRank: number;
  /** Effect text of the highest rank taken, or a placeholder. */
  effectText: string;
  /** 1-based take order; point N arrives at level 9 + N. */
  order: number;
  /** Character level at which this point becomes available. */
  levelGained: number;
}

export interface LevelingBuild {
  classId: string;
  className: string;
  treeId: string;
  treeName: string;
  build: Build;
  picks: LevelingPick[];
  sharePayload: string;
  shareUrl: string;
  classicDiffs: { name: string; status: string }[];
}

export interface LevelingEditorial {
  treeId: string;
  tagline: string;
  why: string;
  tips: string[];
}

/**
 * Which tree to level in and why. Classic-era wisdom: solo questing rewards
 * sustained damage and low downtime, so each class uses its classic leveling
 * tree. Copy stays generic on purpose — exact tuning lives in the data table.
 */
export const LEVELING_EDITORIAL: Record<string, LevelingEditorial> = {
  warrior: {
    treeId: 'warrior:fury',
    tagline: 'Fury keeps Rage flowing and hits fast while questing.',
    why:
      'Leveling a warrior is a battle against downtime: you want talents that keep Rage coming and speed up every kill. The Fury tree leans into fast swings and sustained damage, so quests and grinding feel smoother than a burst-heavy Arms plan at low level.',
    tips: [
      'Take damage and attack-speed talents first; utility can wait until the later rows.',
      'Battle Shout is your best leveling buddy — keep it up and buff it when the tree offers it.',
      'Swap targets instead of stopping: Fury rewards chains of quick kills more than long cooldowns.',
    ],
  },
  paladin: {
    treeId: 'paladin:retribution',
    tagline: 'Retribution turns questing into a steady hit-and-heal loop.',
    why:
      'Paladins level slowly by default — Retribution fixes that. Damage talents shorten every fight, and the tree pairs them with mana-free combat tools, so you kill faster without drinking after each pull.',
    tips: [
      'Seal and Judgement talents come early in the tree and multiply everything you do.',
      'Damage first, then the talents that refund or save mana while grinding.',
      'Blessing of Wisdom is the fallback when a fight runs long; damage seals for everything else.',
    ],
  },
  hunter: {
    treeId: 'hunter:beast-mastery',
    tagline: 'Beast Mastery makes your pet a second tank and you never stop.',
    why:
      'The pet does the tanking, you do the killing. Beast Mastery talents make the pet tougher and angrier, which means fewer deaths, less food, and the fastest solo questing route a hunter can take.',
    tips: [
      'Pet health and damage talents come first — a living pet is your whole leveling engine.',
      'Keep Growl on and let the pet build a beat of threat before opening up.',
      'Feign Death early beats running late; the downtime you save is experience gained.',
    ],
  },
  rogue: {
    treeId: 'rogue:combat',
    tagline: 'Combat is sword-and-board rogue grinding: cheap, steady, durable.',
    why:
      'Combat rewards repetitive, sustainable fighting: hit talents, attack speed, and cheaper combo builders. For leveling — where fights are many and recovery time matters more than burst — it beats the crit gambling of Assassination.',
    tips: [
      'Hit and attack-speed talents first; missing a Sinister Strike is wasted Energy.',
      'Slice and Dice uptime beats a big Eviscerate while grinding mobs.',
      'A instant-poison routine keeps kill speed high without resting.',
    ],
  },
  priest: {
    treeId: 'priest:shadow',
    tagline: 'Shadow turns the priest into a self-sustaining solo killer.',
    why:
      'Shadow damage talents shorten fights and Spirit Tap refills mana after each kill — the classic loop that lets a priest quest non-stop. Holy and Discipline heal better, but neither kills faster.',
    tips: [
      'Spirit Tap and damage talents are the engine; take them before any utility.',
      'Shield → Shadow Word: Pain → Wand keeps mana high on easy mobs.',
      'Wand specialization early is a quiet but real leveling speed boost.',
    ],
  },
  shaman: {
    treeId: 'shaman:enhancement',
    tagline: 'Enhancement is Windfury roulette with almost no downtime.',
    why:
      'Enhancement shaman fight in melee with mana-light attacks and big weapon buffs. Damage talents plus mana-regen tools mean you chain mobs without drinking — the classic fastest route through old Azeroth.',
    tips: [
      'Weapon buff talents first — Rockbiter early, Windfury the moment it unlocks.',
      'Mana regen talents keep the Lightning Shield loop running between pulls.',
      'Stranglethorn Vale rule: drop a Stoneclaw totem before you bite off more than you can chew.',
    ],
  },
  mage: {
    treeId: 'mage:frost',
    tagline: 'Frost is unkillable slow-and-steady: control over raw damage.',
    why:
      'Frost kills slightly slower than Fire but dies almost never. Slows, roots, and the Water Elemental-style control talents turn dangerous pulls into routine ones — and dead mages level at zero XP per hour.',
    tips: [
      'Take the control and mana-efficiency talents first; damage follows in the mid rows.',
      'Frost Nova + distance is your whole defense — talents that extend it are defensive stats.',
      'Evocation and mana talents turn grind sessions into one long chain instead of many short ones.',
    ],
  },
  warlock: {
    treeId: 'warlock:affliction',
    tagline: 'Affliction is drain-grinding: DoTs up, health and mana refunded.',
    why:
      'Affliction locks kill several mobs at once with damage over time, then convert health into mana and drain health back. The tree’s sustain talents mean life tap → drain → repeat, with almost zero downtime.',
    tips: [
      'DoT damage and Drain Life talents are the core loop; take them before pet talents.',
      'Fear is a defensive cooldown while leveling — use it before you need it.',
      'Life Tap efficiency talents are leveling speed in disguise.',
    ],
  },
  druid: {
    treeId: 'druid:feral-combat',
    tagline: 'Feral is cat-speed kills with zero mana downtime.',
    why:
      'Cat Form damage talents make kills fast, and Feral costs almost no mana — you heal with Instincts between pulls instead of drinking. It is the classic druid leveling answer for good reason.',
    tips: [
      'Cat damage talents first; Bear tools matter only for dungeon tanking on the way.',
      'Travel form at 30 is the single biggest quality-of-life jump in the classic grind.',
      'Keep a weapon-swap heal macro for emergencies — Feral mana is for just that.',
    ],
  },
};

/** Leveling-value heuristics applied to rank-1 effect text (lowercased). */
function levelingScore(node: TalentNode): number {
  // Rows further down cost more earlier points; prefer cheaper access slightly.
  let score = -node.row * 0.25;
  if (node.passive) score += 0.5;
  const text = (node.rankEffects[0]?.text ?? '').toLowerCase();
  if (/damage/.test(text) && !/(taken|received|reduces the damage)/.test(text)) score += 4;
  if (/attack power/.test(text)) score += 3;
  if (/critical|crit/.test(text)) score += 3;
  if (/attack speed|haste|swing/.test(text)) score += 2;
  if (/chance to hit|hit chance|chance for your|to miss/.test(text)) score += 2;
  if (/pet\b|your pet|your demon/.test(text)) score += 2;
  if (/regenerat|regen|restores/.test(text)) score += 1.5;
  if (/reduces the (mana|rage|energy) cost|cost of your/.test(text)) score += 1;
  if (/movement speed/.test(text)) score += 1;
  if (/stamina|health\b/.test(text)) score += 0.5;
  // Tanking/healing stats matter least while solo leveling.
  if (/threat|armor\b|block|parry|dodge/.test(text)) score -= 2;
  if (/healing done|heals? (an?|your|friendly)/.test(text)) score -= 2;
  return score;
}

function candidateOrder(snapshot: ClassSnapshot, treeIds: string[]): TalentNode[] {
  return snapshot.talents
    .filter((t) => treeIds.includes(t.treeId))
    .sort(
      (a, b) =>
        levelingScore(b) - levelingScore(a) ||
        a.row - b.row ||
        a.column - b.column ||
        a.name.localeCompare(b.name),
    );
}

function effectTextForRank(node: TalentNode, rank: number): string {
  const effect = node.rankEffects.find((r) => r.rank === rank) ?? node.rankEffects.at(-1);
  return effect?.text ?? 'Effect text pending for this snapshot.';
}

/**
 * Greedy damage-first allocation, every point validated through applyAction.
 * Fills the chosen tree first, then spills leftovers into the other trees.
 */
export function generateLevelingBuild(
  snapshot: ClassSnapshot,
  ruleset: Ruleset,
  classId: string,
  origin: string,
): LevelingBuild {
  const editorial = LEVELING_EDITORIAL[classId];
  if (!editorial) throw new Error(`no leveling editorial for ${classId}`);
  const tree = snapshot.trees.find((t) => t.treeId === editorial.treeId);
  if (!tree) throw new Error(`tree ${editorial.treeId} missing from snapshot for ${classId}`);

  let build = emptyBuild(snapshot.classDef.classId, snapshot.snapshotId, ruleset, ruleset.maxLevel);
  const budget = ruleset.maxBudget;
  const order: string[] = [];

  const fill = (treeIds: string[]) => {
    let progress = true;
    while (spentPoints(build.allocation) < budget && progress) {
      progress = false;
      for (const node of candidateOrder(snapshot, treeIds)) {
        const res = applyAction(build, { type: 'add', talentId: node.talentId }, snapshot, ruleset);
        if (res.ok) {
          build = res.build;
          order.push(node.talentId);
          progress = true;
          break;
        }
      }
    }
  };

  fill([tree.treeId]);
  const otherTrees = snapshot.trees.map((t) => t.treeId).filter((id) => id !== tree.treeId);
  fill(otherTrees);

  const validation = validateBuild(build, snapshot, ruleset);
  if (!validation.valid) {
    throw new Error(`generated leveling build for ${classId} is invalid: ${validation.errors[0]?.message}`);
  }
  if (spentPoints(build.allocation) !== budget) {
    throw new Error(`leveling build for ${classId} spent ${spentPoints(build.allocation)} of ${budget}`);
  }

  const byId = new Map(snapshot.talents.map((t) => [t.talentId, t]));
  const running: Record<string, number> = {};
  const picks: LevelingPick[] = order.map((talentId, index) => {
    const node = byId.get(talentId)!;
    running[talentId] = (running[talentId] ?? 0) + 1;
    const ranksTaken = running[talentId];
    return {
      talentId,
      name: node.name,
      treeId: node.treeId,
      row: node.row,
      column: node.column,
      ranksTaken,
      maxRank: node.maxRank,
      effectText: effectTextForRank(node, ranksTaken),
      order: index + 1,
      levelGained: (ruleset.pointsStartLevel - 1) + index + 1,
    };
  });

  const classicDiffs = [...new Map(
    order
      .map((id) => byId.get(id)!)
      .filter((n) => n.classic && ['new', 'changed', 'moved'].includes(n.classic.status))
      .map((n) => [n.talentId, { name: n.name, status: n.classic!.status }]),
  ).values()];

  const sharePayload = encodeBuild(build);

  return {
    classId,
    className: snapshot.classDef.name,
    treeId: tree.treeId,
    treeName: tree.name,
    build,
    picks,
    sharePayload,
    shareUrl: `${origin}/${classId}/#b=${sharePayload}`,
    classicDiffs,
  };
}

/** Take-order groups for the 10–20 / 20–40 / 40–60 page sections. */
export function phaseSlices(picks: LevelingPick[]) {
  const byOrder = (a: LevelingPick, b: LevelingPick) => a.order - b.order;
  return {
    early: picks.filter((p) => p.levelGained <= 20).sort(byOrder),
    mid: picks.filter((p) => p.levelGained > 20 && p.levelGained <= 40).sort(byOrder),
    late: picks.filter((p) => p.levelGained > 40).sort(byOrder),
  };
}

/** Collapse consecutive picks of the same talent into one table row. */
export function collapsePicks(picks: LevelingPick[]): (LevelingPick & { points: number })[] {
  const rows: (LevelingPick & { points: number })[] = [];
  for (const pick of picks) {
    const last = rows.at(-1);
    if (last && last.talentId === pick.talentId) {
      last.points += 1;
      last.ranksTaken = pick.ranksTaken;
      last.effectText = pick.effectText;
    } else {
      rows.push({ ...pick, points: 1 });
    }
  }
  return rows;
}
