/**
 * Compare two published talent snapshots and list what changed, per class:
 * added, removed, renamed, moved, rank-count, prerequisite and rank-text
 * changes. Run it by hand after `npm run data:import`:
 *
 *   npm run data:diff                                    # working tree vs HEAD
 *   npm run data:diff -- --old-ref origin/main           # vs another git ref
 *   npm run data:diff -- --old-dir /path/with/public/data  # vs a directory
 *   npm run data:diff -- --json out.json                 # structured output
 *   npm run data:diff -- --write-changelog               # write the changelog entry
 *
 * "Renamed" means the talent registry (src/data/mappings/id-registry.json)
 * aliases the old ID to a new one, i.e. what old share links will do. Pairs
 * that merely look alike (same icon or same cell) but are not aliased are
 * listed separately as "possible renames" for a human to check before adding
 * them to RENAMES in scripts/data/import.mjs.
 *
 * The diff compares the upstream's current records. It says what the data
 * source now records, not what the game has confirmed.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const out = { oldRef: 'HEAD', oldDir: null, json: null, writeChangelog: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--old-ref') out.oldRef = argv[++i];
    else if (a === '--old-dir') out.oldDir = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--write-changelog') out.writeChangelog = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function readOld(relPath) {
  if (args.oldDir) {
    return readFile(path.join(args.oldDir, relPath), 'utf8').then(JSON.parse);
  }
  const text = execFileSync('git', ['show', `${args.oldRef}:${relPath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return Promise.resolve(JSON.parse(text));
}

async function readNew(relPath) {
  return JSON.parse(await readFile(path.join(root, relPath), 'utf8'));
}

async function loadSet(reader) {
  const manifest = await reader('public/data/manifest.json');
  const classes = {};
  for (const f of manifest.classes) {
    classes[f.classId] = await reader(path.posix.join('public', f.path));
  }
  return { manifest, classes };
}

const oldSet = await loadSet(readOld);
const newSet = await loadSet(readNew);
const registry = await readNew('src/data/mappings/id-registry.json');

const norm = (t) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim());
const cell = (talent, treeNames) => ({
  tree: treeNames.get(talent.treeId) ?? talent.treeId,
  row: talent.row + 1,
  column: talent.column + 1,
});

function treeNameMap(snapshot) {
  return new Map(snapshot.trees.map((t) => [t.treeId, t.name]));
}

function prereqNames(snapshot, talent) {
  const byId = new Map(snapshot.talents.map((t) => [t.talentId, t.name]));
  return talent.prerequisites
    .map((p) => `${byId.get(p.talentId) ?? p.talentId} (rank ${p.requiredRank})`)
    .sort();
}

const sameCell = (a, b) => a.tree === b.tree && a.row === b.row && a.column === b.column;

const result = {
  from: {
    snapshotId: oldSet.manifest.snapshotId,
    gameBuild: oldSet.manifest.gameBuild,
    upstreamExport: oldSet.manifest.sources?.[0]?.recordedAt ?? null,
    publishedAt: oldSet.manifest.publishedAt,
    ranksTotal: oldSet.manifest.coverage?.ranksTotal ?? null,
    ranksWithText: oldSet.manifest.coverage?.ranksWithText ?? null,
  },
  to: {
    snapshotId: newSet.manifest.snapshotId,
    gameBuild: newSet.manifest.gameBuild,
    upstreamExport: newSet.manifest.sources?.[0]?.recordedAt ?? null,
    publishedAt: newSet.manifest.publishedAt,
    checkedAt: newSet.manifest.checkedAt ?? null,
    sourceFileSha256: newSet.manifest.sourceFileSha256 ?? null,
    ranksTotal: newSet.manifest.coverage?.ranksTotal ?? null,
    ranksWithText: newSet.manifest.coverage?.ranksWithText ?? null,
  },
  classes: {},
};

for (const classId of Object.keys(newSet.classes)) {
  const oldSnap = oldSet.classes[classId];
  const newSnap = newSet.classes[classId];
  const oldTrees = treeNameMap(oldSnap);
  const newTrees = treeNameMap(newSnap);
  const oldBy = new Map(oldSnap.talents.map((t) => [t.name, t]));
  const newBy = new Map(newSnap.talents.map((t) => [t.name, t]));

  const entry = {
    className: newSnap.classDef.name,
    talentsBefore: oldSnap.talents.length,
    talentsAfter: newSnap.talents.length,
    ranksBefore: oldSnap.talents.reduce((n, t) => n + t.rankEffects.length, 0),
    ranksAfter: newSnap.talents.reduce((n, t) => n + t.rankEffects.length, 0),
    added: [],
    removed: [],
    renamed: [],
    possibleRenames: [],
    moved: [],
    maxRankChanged: [],
    prerequisitesChanged: [],
    textChanged: [],
  };

  const removedNames = [...oldBy.keys()].filter((n) => !newBy.has(n));
  const addedNames = [...newBy.keys()].filter((n) => !oldBy.has(n));

  // Renames: what the registry will do for old share links.
  const renamedTo = new Set();
  const renamedFrom = new Set();
  for (const name of removedNames) {
    const oldTalent = oldBy.get(name);
    const reg = registry[oldTalent.talentId];
    if (reg?.status === 'renamed' && reg.aliasOf) {
      const target = newSnap.talents.find((t) => t.talentId === reg.aliasOf);
      if (target && !oldBy.has(target.name)) {
        entry.renamed.push({
          from: name,
          to: target.name,
          at: cell(target, newTrees),
        });
        renamedFrom.add(name);
        renamedTo.add(target.name);
      }
    }
  }

  for (const name of removedNames) {
    if (renamedFrom.has(name)) continue;
    const t = oldBy.get(name);
    entry.removed.push({ name, ...cell(t, oldTrees) });
  }
  for (const name of addedNames) {
    if (renamedTo.has(name)) continue;
    const t = newBy.get(name);
    entry.added.push({ name, ...cell(t, newTrees) });
  }

  // Look-alike pairs that are NOT aliased: for a human to review.
  for (const r of entry.removed) {
    const oldTalent = oldBy.get(r.name);
    for (const a of entry.added) {
      const newTalent = newBy.get(a.name);
      const sameIcon = oldTalent.iconRef === newTalent.iconRef;
      const sameSpot = sameCell(r, a);
      const sameFirstText =
        norm(oldTalent.rankEffects[0]?.text) === norm(newTalent.rankEffects[0]?.text);
      const evidence = [];
      if (sameSpot) evidence.push('same cell');
      if (sameIcon) evidence.push('same icon');
      if (sameFirstText) evidence.push('same rank 1 text');
      if (evidence.length > 0 && (sameIcon || sameSpot)) {
        entry.possibleRenames.push({ from: r.name, to: a.name, evidence });
      }
    }
  }

  // Same-name talents: position, ranks, prerequisites, text.
  for (const [name, newTalent] of newBy) {
    const oldTalent = oldBy.get(name);
    if (!oldTalent) continue;
    const from = cell(oldTalent, oldTrees);
    const to = cell(newTalent, newTrees);
    if (!sameCell(from, to)) entry.moved.push({ name, from, to });
    if (oldTalent.maxRank !== newTalent.maxRank) {
      entry.maxRankChanged.push({ name, from: oldTalent.maxRank, to: newTalent.maxRank });
    }
    const pFrom = prereqNames(oldSnap, oldTalent);
    const pTo = prereqNames(newSnap, newTalent);
    if (JSON.stringify(pFrom) !== JSON.stringify(pTo)) {
      entry.prerequisitesChanged.push({ name, from: pFrom, to: pTo });
    }
    const ranks = [];
    const count = Math.max(oldTalent.rankEffects.length, newTalent.rankEffects.length);
    for (let i = 0; i < count; i++) {
      const before = norm(oldTalent.rankEffects[i]?.text);
      const after = norm(newTalent.rankEffects[i]?.text);
      if (before !== after) ranks.push({ rank: i + 1, before, after });
    }
    if (ranks.length > 0) entry.textChanged.push({ name, ranks });
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  entry.added.sort(byName);
  entry.removed.sort(byName);
  entry.moved.sort(byName);
  entry.maxRankChanged.sort(byName);
  entry.prerequisitesChanged.sort(byName);
  entry.textChanged.sort(byName);
  entry.renamed.sort((a, b) => a.from.localeCompare(b.from));
  result.classes[classId] = entry;
}

// ---------- Output ----------

const kinds = [
  ['added', 'added'],
  ['removed', 'removed'],
  ['renamed', 'renamed'],
  ['moved', 'moved'],
  ['maxRankChanged', 'max rank changed'],
  ['prerequisitesChanged', 'prerequisites changed'],
  ['textChanged', 'rank text changed'],
];

const lines = [];
lines.push(
  `Snapshot ${result.from.snapshotId} (build ${result.from.gameBuild}, export ${result.from.upstreamExport})` +
    ` -> ${result.to.snapshotId} (build ${result.to.gameBuild}, export ${result.to.upstreamExport}, checked ${result.to.checkedAt})`,
);
lines.push(
  `Ranks with text: ${result.from.ranksWithText}/${result.from.ranksTotal} -> ${result.to.ranksWithText}/${result.to.ranksTotal}`,
);
lines.push('');
lines.push(
  ['class', 'talents', 'ranks', ...kinds.map(([, label]) => label)].join(' | '),
);
const totals = Object.fromEntries(kinds.map(([k]) => [k, 0]));
for (const [classId, e] of Object.entries(result.classes)) {
  for (const [k] of kinds) totals[k] += e[k].length;
  lines.push(
    [
      classId,
      `${e.talentsBefore}->${e.talentsAfter}`,
      `${e.ranksBefore}->${e.ranksAfter}`,
      ...kinds.map(([k]) => e[k].length),
    ].join(' | '),
  );
}
lines.push(['total', '', '', ...kinds.map(([k]) => totals[k])].join(' | '));
lines.push('');
for (const [classId, e] of Object.entries(result.classes)) {
  const parts = [];
  for (const a of e.added) parts.push(`  + ${a.name} (${a.tree} row ${a.row}, col ${a.column})`);
  for (const r of e.removed) parts.push(`  - ${r.name} (was ${r.tree} row ${r.row}, col ${r.column})`);
  for (const r of e.renamed) parts.push(`  ~ ${r.from} -> ${r.to}`);
  for (const m of e.moved) {
    parts.push(
      `  > ${m.name}: ${m.from.tree} r${m.from.row}c${m.from.column} -> ${m.to.tree} r${m.to.row}c${m.to.column}`,
    );
  }
  for (const m of e.maxRankChanged) parts.push(`  # ${m.name}: max rank ${m.from} -> ${m.to}`);
  for (const m of e.prerequisitesChanged) {
    parts.push(`  & ${m.name}: requires [${m.from.join(', ')}] -> [${m.to.join(', ')}]`);
  }
  for (const t of e.textChanged) {
    parts.push(`  T ${t.name}: rank text changed on rank ${t.ranks.map((r) => r.rank).join(', ')}`);
  }
  for (const p of e.possibleRenames) {
    parts.push(`  ? possible rename not applied: ${p.from} -> ${p.to} (${p.evidence.join(', ')})`);
  }
  if (parts.length > 0) {
    lines.push(`${e.className}:`);
    lines.push(...parts);
  }
}
console.log(lines.join('\n'));

if (args.json) {
  await writeFile(path.resolve(args.json), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nwrote ${args.json}`);
}

if (args.writeChangelog) {
  // Structured entry rendered by src/pages/changelog/index.astro.
  const dir = path.join(root, 'src/data/changelog');
  await mkdir(dir, { recursive: true });
  const slug = `${result.to.checkedAt ?? result.to.publishedAt}-build-${result.to.gameBuild}`;
  const entry = {
    id: slug,
    date: result.to.checkedAt ?? result.to.publishedAt,
    build: result.to.gameBuild,
    upstreamExport: result.to.upstreamExport,
    previousBuild: result.from.gameBuild,
    previousUpstreamExport: result.from.upstreamExport,
    snapshotId: result.to.snapshotId,
    previousSnapshotId: result.from.snapshotId,
    ranksTotal: result.to.ranksTotal,
    ranksWithText: result.to.ranksWithText,
    classes: Object.fromEntries(
      Object.entries(result.classes).map(([classId, e]) => [
        classId,
        {
          className: e.className,
          talentsBefore: e.talentsBefore,
          talentsAfter: e.talentsAfter,
          added: e.added,
          removed: e.removed,
          renamed: e.renamed,
          moved: e.moved,
          maxRankChanged: e.maxRankChanged,
          prerequisitesChanged: e.prerequisitesChanged,
          textChanged: e.textChanged,
        },
      ]),
    ),
  };
  const file = path.join(dir, `${slug}.json`);
  await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(root, file)}`);
}
