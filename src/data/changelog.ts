/**
 * Data-update changelog entries.
 *
 * Each entry is a JSON file in src/data/changelog/, written by
 * `npm run data:diff -- --write-changelog` after a data sync. The changelog
 * page renders them newest first. The entries describe what the upstream
 * export now records compared with the previous snapshot; they are not
 * game-confirmed values.
 */

export interface Cell {
  tree: string;
  row: number;
  column: number;
}

export interface ChangelogClass {
  className: string;
  talentsBefore: number;
  talentsAfter: number;
  added: ({ name: string } & Cell)[];
  removed: ({ name: string } & Cell)[];
  renamed: { from: string; to: string; at: Cell }[];
  moved: { name: string; from: Cell; to: Cell }[];
  maxRankChanged: { name: string; from: number; to: number }[];
  prerequisitesChanged: { name: string; from: string[]; to: string[] }[];
  textChanged: {
    name: string;
    ranks: { rank: number; before: string | null; after: string | null }[];
  }[];
}

export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD, the day the upstream export was checked
  build: string;
  upstreamExport: string | null;
  previousBuild: string | null;
  previousUpstreamExport: string | null;
  snapshotId: string;
  previousSnapshotId: string;
  ranksTotal: number | null;
  ranksWithText: number | null;
  classes: Record<string, ChangelogClass>;
}

const modules = import.meta.glob<ChangelogEntry>('./changelog/*.json', {
  eager: true,
  import: 'default',
});

/** Newest first. */
export function loadChangelogEntries(): ChangelogEntry[] {
  return Object.values(modules).sort((a, b) =>
    a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date),
  );
}

export function classHasChanges(c: ChangelogClass): boolean {
  return (
    c.added.length +
      c.removed.length +
      c.renamed.length +
      c.moved.length +
      c.maxRankChanged.length +
      c.prerequisitesChanged.length +
      c.textChanged.length >
    0
  );
}

export function entryTotals(entry: ChangelogEntry): Record<string, number> {
  const totals = {
    added: 0,
    removed: 0,
    renamed: 0,
    moved: 0,
    rankCount: 0,
    prerequisites: 0,
    text: 0,
  };
  for (const c of Object.values(entry.classes)) {
    totals.added += c.added.length;
    totals.removed += c.removed.length;
    totals.renamed += c.renamed.length;
    totals.moved += c.moved.length;
    totals.rankCount += c.maxRankChanged.length;
    totals.prerequisites += c.prerequisitesChanged.length;
    totals.text += c.textChanged.length;
  }
  return totals;
}

export function describeCell(cell: Cell): string {
  return `${cell.tree} row ${cell.row}`;
}

export function describeMove(from: Cell, to: Cell): string {
  if (from.tree !== to.tree) return `${describeCell(from)} → ${describeCell(to)}`;
  if (from.row !== to.row) return `${from.tree} row ${from.row} → row ${to.row}`;
  return `${from.tree} row ${from.row}, column ${from.column} → column ${to.column}`;
}

export function describeRequires(names: string[]): string {
  return names.length > 0 ? names.join(' and ') : 'no prerequisite';
}
