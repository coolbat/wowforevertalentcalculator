/**
 * Open a share link from an earlier snapshot on the current talent data.
 * Renamed talents keep their points under the new id. Removed talents refund
 * those points. Anything the current rules still reject is dropped until the
 * remaining build validates, or until a non-node error (such as the point
 * budget) remains.
 */
import type { Allocation, Build, ClassSnapshot, Ruleset } from '../talents/types';
import { validateBuild } from '../talents/rules';

export type MigrationAction = 'kept' | 'renamed' | 'refunded';

export interface RegistryEntry {
  classId: string;
  sourceName: string;
  sourceTree: string;
  status?: 'active' | 'renamed' | 'removed';
  aliasOf?: string | null;
}

export interface MigrationNote {
  fromId: string;
  toId: string | null;
  rank: number;
  action: MigrationAction;
}

export interface MigrationResult {
  build: Build;
  notes: MigrationNote[];
}

const REPAIR_LIMIT = 40;

export function allowedSnapshotIds(manifest: {
  snapshotId: string;
  legacySnapshotIds?: readonly string[] | null;
}): string[] {
  return [manifest.snapshotId, ...(manifest.legacySnapshotIds ?? [])];
}

export function migrateBuild(
  build: Build,
  currentSnapshotId: string,
  registry: Record<string, RegistryEntry>,
  snapshot: ClassSnapshot,
  ruleset: Ruleset,
): MigrationResult {
  const byId = new Map(snapshot.talents.map((talent) => [talent.talentId, talent]));
  const allocation: Allocation = {};
  const notes: MigrationNote[] = [];

  for (const [id, rank] of Object.entries(build.allocation)) {
    if (!Number.isInteger(rank) || rank <= 0) continue;
    const entry = registry[id];
    const alias = entry?.aliasOf;
    if (alias && byId.has(alias)) {
      const applied = addRank(allocation, alias, rank, byId.get(alias)!.maxRank);
      if (applied > 0) {
        notes.push({ fromId: id, toId: alias, rank: applied, action: 'renamed' });
      }
      if (applied < rank) {
        notes.push({ fromId: id, toId: null, rank: rank - applied, action: 'refunded' });
      }
      continue;
    }
    if (!byId.has(id) || entry?.status === 'removed') {
      notes.push({ fromId: id, toId: null, rank, action: 'refunded' });
      continue;
    }
    const node = byId.get(id)!;
    const applied = addRank(allocation, id, rank, node.maxRank);
    if (applied > 0) {
      notes.push({ fromId: id, toId: id, rank: applied, action: 'kept' });
    }
    if (applied < rank) {
      notes.push({ fromId: id, toId: null, rank: rank - applied, action: 'refunded' });
    }
  }

  let current: Build = {
    ...build,
    snapshotId: currentSnapshotId,
    rulesetId: snapshot.rulesetId,
    allocation,
  };

  for (let pass = 0; pass < REPAIR_LIMIT; pass++) {
    const validation = validateBuild(current, snapshot, ruleset);
    if (validation.valid) break;
    const drop = new Set<string>();
    for (const error of validation.errors) {
      if (error.nodeId && current.allocation[error.nodeId]) drop.add(error.nodeId);
    }
    if (drop.size === 0) break;
    const next: Allocation = { ...current.allocation };
    for (const id of drop) {
      const spent = next[id] ?? 0;
      if (spent > 0) {
        notes.push({ fromId: id, toId: null, rank: spent, action: 'refunded' });
        delete next[id];
      }
    }
    current = { ...current, allocation: next };
  }

  return { build: current, notes };
}

export function migrationBanner(notes: MigrationNote[]): string | null {
  const renamed = notes.some((note) => note.action === 'renamed');
  const refunded = notes.some((note) => note.action === 'refunded');
  if (!renamed && !refunded) return null;
  const parts: string[] = [];
  if (renamed) parts.push('Points on renamed talents were kept under the current names.');
  if (refunded) {
    parts.push('Points on talents that are no longer in this snapshot were refunded.');
  }
  return parts.join(' ');
}

function addRank(allocation: Allocation, talentId: string, rank: number, maxRank: number): number {
  const prev = allocation[talentId] ?? 0;
  const next = Math.min(maxRank, prev + rank);
  if (next <= 0) return 0;
  allocation[talentId] = next;
  return next - prev;
}
