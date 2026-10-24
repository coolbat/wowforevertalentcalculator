/**
 * Data pipeline: normalize talentsforever.com export (CC-BY-4.0) into
 * immutable, content-hashed snapshot files. See PRD §9 and §12.
 *
 * Input:  data-raw/talentsforever-data.json
 * Output: public/data/manifest.json
 *         public/data/classes/<classId>.<hash>.json  (immutable snapshots)
 *         src/data/generated/manifest.json           (build-time copy)
 *         src/data/mappings/id-registry.json         (stable ID registry)
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW_PATH = path.join(root, 'data-raw/talentsforever-data.json');
const META_PATH = path.join(root, 'data-raw/upstream-meta.json');
const OUT_DATA = path.join(root, 'public/data');
const OUT_GEN = path.join(root, 'src/data/generated');
const OUT_MAP = path.join(root, 'src/data/mappings');

const SCHEMA_VERSION = 1;
const RULESET = {
  rulesetId: 'forever-standard-v1',
  minLevel: 1,
  maxLevel: 60,
  defaultLevel: 60,
  maxBudget: 51,
  pointsStartLevel: 10,
  pointsPerRowTier: 5,
};

const CLASS_META = {
  Warrior: { classId: 'warrior', nameZh: '战士', color: '#C79C6E' },
  Paladin: { classId: 'paladin', nameZh: '圣骑士', color: '#F58CBA' },
  Hunter: { classId: 'hunter', nameZh: '猎人', color: '#ABD473' },
  Rogue: { classId: 'rogue', nameZh: '潜行者', color: '#FFF569' },
  Priest: { classId: 'priest', nameZh: '牧师', color: '#FFFFFF' },
  Shaman: { classId: 'shaman', nameZh: '萨满祭司', color: '#0070DE' },
  Mage: { classId: 'mage', nameZh: '法师', color: '#69CCF0' },
  Warlock: { classId: 'warlock', nameZh: '术士', color: '#9482C9' },
  Druid: { classId: 'druid', nameZh: '德鲁伊', color: '#FF7D0A' },
};

/** Display-name overrides decided during PRD review (v1.1). */
const TREE_NAME_OVERRIDES = {
  'priest:Shadow Magic': 'Shadow',
};

const CLASSIC_STATUS_MAP = {
  same: 'unchanged',
  changed: 'changed',
  moved: 'moved',
  removed: 'removed',
  new: 'new',
};

// Dates and the game build are derived from the raw export and its fetch
// record (data-raw/upstream-meta.json, written by `npm run data:fetch`);
// nothing about a particular build is hard-coded here.

/**
 * Talents that continue under a new name, keyed by their previous ID.
 * Add an entry only after checking the new build: same tree, and either the
 * same cell and icon or the same icon plus the previous effect text
 * (`npm run data:diff` lists these candidates with that evidence). Old IDs
 * stay in the registry so share links keep those points. Anything not listed
 * here that disappears is registered as removed, and its points are
 * refunded when an old link is opened.
 */
const RENAMES = {
  // build 70291 (2026-10-15 sync)
  'druid:mangle': 'druid:primal-bite',
  'druid:primal-fury': 'druid:blood-frenzy',
  'druid:predatory-instincts': 'druid:natural-instinct',
  'mage:hot-streak': 'mage:heating-up',
  'warlock:soul-harvesting': 'warlock:soul-harvest',
  // build 70425 (2026-10-20 sync): same tree, same cell, same icon and rank
  // count, and the new rank 1 text starts with the old rank 1 sentence.
  'mage:wake-of-fire': 'mage:improved-fire-blast',
  'shaman:improved-fire-nova': 'shaman:trial-by-fire',
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeRankText(talent) {
  // desc: array (index+1 = rank) or object keyed by rank string
  const textByRank = new Map();
  if (Array.isArray(talent.desc)) {
    talent.desc.forEach((text, i) => textByRank.set(i + 1, text));
  } else if (talent.desc && typeof talent.desc === 'object') {
    for (const [k, v] of Object.entries(talent.desc)) {
      textByRank.set(Number(k), v);
    }
  }
  // est: object keyed by rank string with estimated text
  const estByRank = new Map();
  if (talent.est && typeof talent.est === 'object') {
    for (const [k, v] of Object.entries(talent.est)) {
      estByRank.set(Number(k), v);
    }
  }
  const confirmed = new Set(
    Array.isArray(talent.confirmed) ? talent.confirmed.map(Number) : [],
  );
  const ranks = [];
  for (let rank = 1; rank <= talent.max; rank++) {
    if (textByRank.has(rank)) {
      ranks.push({
        rank,
        text: textByRank.get(rank),
        evidenceStatus: confirmed.has(rank)
          ? 'community_recorded'
          : 'source_estimate',
      });
    } else if (estByRank.has(rank)) {
      ranks.push({
        rank,
        text: estByRank.get(rank),
        evidenceStatus: 'source_estimate',
      });
    } else {
      ranks.push({ rank, text: null, evidenceStatus: 'unknown' });
    }
  }
  return ranks;
}

function fail(msg) {
  console.error(`IMPORT FAILED: ${msg}`);
  process.exit(1);
}

const rawBytes = await readFile(RAW_PATH);
const raw = JSON.parse(rawBytes.toString('utf8'));
if (raw.license !== 'CC-BY-4.0') {
  fail(`unexpected license: ${raw.license}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.generated))) {
  fail(`unexpected generated date: ${raw.generated}`);
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

// The fetch record ties the "checked" date to the exact bytes next to it.
const upstreamMeta = await readJsonIfExists(META_PATH);
if (!upstreamMeta) {
  fail('data-raw/upstream-meta.json is missing; run `npm run data:fetch`');
}
const RAW_SHA256 = sha256(rawBytes);
if (upstreamMeta.sha256 !== RAW_SHA256) {
  fail(
    'data-raw/talentsforever-data.json does not match upstream-meta.json ' +
      `(recorded ${upstreamMeta.sha256}, file is ${RAW_SHA256}); run \`npm run data:fetch\``,
  );
}
if (upstreamMeta.generated !== raw.generated) {
  fail(`upstream-meta generated ${upstreamMeta.generated} != raw ${raw.generated}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(upstreamMeta.checkedAt))) {
  fail(`upstream-meta checkedAt is not a date: ${upstreamMeta.checkedAt}`);
}

// Game build: every class names the client build its trees were read from.
const buildsByClass = {};
for (const [name, data] of Object.entries(raw.talents ?? {})) {
  const m = /\b1\.\d+\.\d+\.(\d+)\b/.exec(String(data?.source ?? ''));
  buildsByClass[name] = m ? m[1] : null;
}
const buildSet = new Set(Object.values(buildsByClass));
if (buildSet.size !== 1 || buildSet.has(null)) {
  fail(`classes do not agree on one client build: ${JSON.stringify(buildsByClass)}`);
}
const GAME_BUILD = [...buildSet][0];
const RECORDED_AT = raw.generated; // upstream export date
const CHECKED_AT = upstreamMeta.checkedAt; // when we last fetched and compared it
const PUBLISHED_AT = CHECKED_AT; // the sync this snapshot was published with

const idRegistry = {};
const classSnapshots = [];
const coverage = {
  structureReviewed: true,
  talentCount: 0,
  ranksTotal: 0,
  ranksWithText: 0,
  ranksCommunityRecorded: 0,
  ranksSourceEstimate: 0,
  ranksUnknown: 0,
  prerequisitesResolved: 0,
  prerequisitesTotal: 0,
};

for (const [className, meta] of Object.entries(CLASS_META)) {
  const classData = raw.talents[className];
  if (!classData) fail(`class missing in source data: ${className}`);
  if (!Array.isArray(classData.trees) || classData.trees.length !== 3) {
    fail(`${className}: expected 3 trees, got ${classData.trees?.length}`);
  }

  const { classId } = meta;
  const talents = [];
  const trees = [];
  const nameToId = new Map();
  const slugCount = new Map();

  // First pass: assign stable IDs.
  for (const tree of classData.trees) {
    for (const tal of tree.talents) {
      const base = slugify(tal.name);
      slugCount.set(base, (slugCount.get(base) ?? 0) + 1);
      const slug =
        slugCount.get(base) === 1 ? base : `${base}-${slugCount.get(base)}`;
      const talentId = `${classId}:${slug}`;
      if (nameToId.has(tal.name)) {
        fail(`${className}: duplicate talent name "${tal.name}"`);
      }
      nameToId.set(tal.name, talentId);
      idRegistry[talentId] = {
        classId,
        sourceName: tal.name,
        sourceTree: tree.name,
      };
    }
  }

  // Second pass: normalize talents.
  const coords = new Set();
  for (const tree of classData.trees) {
    const treeSlug = slugify(
      TREE_NAME_OVERRIDES[`${classId}:${tree.name}`] ?? tree.name,
    );
    const treeId = `${classId}:${treeSlug}`;
    const treeName = TREE_NAME_OVERRIDES[`${classId}:${tree.name}`] ?? tree.name;
    const talentIds = [];

    for (const tal of tree.talents) {
      const talentId = nameToId.get(tal.name);
      const row = tal.row - 1;
      const column = tal.col - 1;
      if (!Number.isInteger(row) || row < 0 || row > 6) {
        fail(`${talentId}: row out of range: ${tal.row}`);
      }
      if (!Number.isInteger(column) || column < 0 || column > 3) {
        fail(`${talentId}: col out of range: ${tal.col}`);
      }
      const coordKey = `${treeId}:${row}:${column}`;
      if (coords.has(coordKey)) fail(`coordinate conflict at ${coordKey}`);
      coords.add(coordKey);
      if (!Number.isInteger(tal.max) || tal.max < 1) {
        fail(`${talentId}: invalid max ${tal.max}`);
      }

      const prerequisites = [];
      if (tal.req) {
        coverage.prerequisitesTotal++;
        const targetId = nameToId.get(tal.req);
        if (!targetId) {
          fail(`${talentId}: unresolved prerequisite "${tal.req}"`);
        }
        coverage.prerequisitesResolved++;
        // requiredRank 1 is an assumption not stated by the source; tracked
        // as estimate until client verification (PRD §9.2).
        prerequisites.push({ talentId: targetId, requiredRank: 1 });
      }

      const rankEffects = normalizeRankText(tal).map((r) => ({
        ...r,
        sourceIds: ['src-talentsforever'],
      }));

      let classic = null;
      if (tal.classic && typeof tal.classic === 'object') {
        const c = tal.classic;
        classic = {
          status: CLASSIC_STATUS_MAP[c.status] ?? 'unknown',
          tree:
            typeof c.tree === 'string'
              ? (TREE_NAME_OVERRIDES[`${classId}:${c.tree}`] ?? c.tree)
              : null,
          row: Number.isInteger(c.row) ? c.row - 1 : null,
          column: Number.isInteger(c.col) ? c.col - 1 : null,
          maxRank: Number.isInteger(c.max) ? c.max : null,
          text: c.text ?? null,
          evidenceStatus: 'community_recorded',
        };
      }

      talents.push({
        talentId,
        treeId,
        name: tal.name,
        row,
        column,
        maxRank: tal.max,
        requiredEarlierPoints: row * RULESET.pointsPerRowTier,
        prerequisites,
        rankEffects,
        passive: Boolean(tal.passive),
        cost: tal.cost ?? null,
        requirementText: tal.reqText ?? null,
        iconRef: tal.icon ?? 'unknown',
        classic,
        note: tal.note ?? null,
      });

      talentIds.push(talentId);
      coverage.talentCount++;
      for (const r of rankEffects) {
        coverage.ranksTotal++;
        if (r.text != null) coverage.ranksWithText++;
        if (r.evidenceStatus === 'community_recorded') {
          coverage.ranksCommunityRecorded++;
        } else if (r.evidenceStatus === 'source_estimate') {
          coverage.ranksSourceEstimate++;
        } else if (r.evidenceStatus === 'unknown') {
          coverage.ranksUnknown++;
        }
      }
    }

    const maxRow = Math.max(...tree.talents.map((t) => t.row - 1));
    const maxCol = Math.max(...tree.talents.map((t) => t.col - 1));
    const removedClassic = (tree.removed ?? []).map((r) => ({
      name: r.name,
      tree: treeName,
      row: Number.isInteger(r.row) ? r.row - 1 : null,
      column: Number.isInteger(r.col) ? r.col - 1 : null,
      text: r.text ?? null,
      note: r.note ?? null,
    }));

    trees.push({
      treeId,
      classId,
      name: treeName,
      nameZh: null,
      grid: { rows: maxRow + 1, columns: maxCol + 1 },
      talentIds,
      removedClassic,
    });
  }

  // Structural self-checks: acyclic prerequisites, prereq target exists.
  const byId = new Map(talents.map((t) => [t.talentId, t]));
  for (const t of talents) {
    for (const p of t.prerequisites) {
      const target = byId.get(p.talentId);
      if (!target) fail(`${t.talentId}: prereq target missing ${p.talentId}`);
      if (target.treeId !== t.treeId) {
        fail(`${t.talentId}: cross-tree prereq ${p.talentId} (unsupported)`);
      }
      if (p.requiredRank > target.maxRank) {
        fail(`${t.talentId}: requiredRank exceeds maxRank of ${p.talentId}`);
      }
    }
  }
  // Cycle detection via DFS.
  const visiting = new Set();
  const done = new Set();
  const dfs = (id) => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(`circular prerequisite at ${id}`);
    visiting.add(id);
    for (const p of byId.get(id).prerequisites) dfs(p.talentId);
    visiting.delete(id);
    done.add(id);
  };
  for (const t of talents) dfs(t.talentId);

  classSnapshots.push({
    schemaVersion: SCHEMA_VERSION,
    snapshotId: '', // filled after hashing
    rulesetId: RULESET.rulesetId,
    classDef: {
      classId,
      name: className,
      nameZh: meta.nameZh,
      color: meta.color,
      treeIds: trees.map((t) => t.treeId),
      iconRef: classData.icon ?? 'unknown',
    },
    trees,
    talents,
  });
}

// Hash per-class snapshots, derive snapshotId from combined digests.
await mkdir(OUT_DATA, { recursive: true });
await mkdir(path.join(OUT_DATA, 'classes'), { recursive: true });
await mkdir(OUT_GEN, { recursive: true });
await mkdir(OUT_MAP, { recursive: true });

// Remove stale hashed class files (immutable naming: old files accumulate
// across imports only when content changes; clean to avoid orphans).
for (const f of await readdir(path.join(OUT_DATA, 'classes'))) {
  if (f.endsWith('.json')) await rm(path.join(OUT_DATA, 'classes', f));
}

const classFiles = [];
for (const snap of classSnapshots) {
  const body = JSON.stringify(snap.classDef) + JSON.stringify(snap.trees) +
    JSON.stringify(snap.talents);
  const digest = sha256(body);
  snap.snapshotId = `snap-${digest.slice(0, 12)}`;
  const finalBody = JSON.stringify(snap);
  const finalDigest = sha256(finalBody);
  const fileName = `${snap.classDef.classId}.${finalDigest.slice(0, 12)}.json`;
  await writeFile(path.join(OUT_DATA, 'classes', fileName), finalBody);
  classFiles.push({
    classId: snap.classDef.classId,
    path: `/data/classes/${fileName}`,
    digest: finalDigest,
  });
}

const combinedDigest = sha256(
  classFiles.map((f) => `${f.classId}:${f.digest}`).join('\n'),
);
const snapshotId = `snap-${combinedDigest.slice(0, 12)}`;

// Rewrite snapshotId inside class files so all classes share one snapshotId.
for (let i = 0; i < classSnapshots.length; i++) {
  const snap = classSnapshots[i];
  snap.snapshotId = snapshotId;
  const finalBody = JSON.stringify(snap);
  const finalDigest = sha256(finalBody);
  const fileName = `${snap.classDef.classId}.${finalDigest.slice(0, 12)}.json`;
  // name embeds pre-snapshotId digest; keep stable by re-hashing final body
  classFiles[i] = {
    classId: snap.classDef.classId,
    path: `/data/classes/${fileName}`,
    digest: finalDigest,
  };
}
for (const f of await readdir(path.join(OUT_DATA, 'classes'))) {
  if (f.endsWith('.json')) await rm(path.join(OUT_DATA, 'classes', f));
}
for (let i = 0; i < classSnapshots.length; i++) {
  const fileName = classFiles[i].path.split('/').pop();
  await writeFile(
    path.join(OUT_DATA, 'classes', fileName),
    JSON.stringify(classSnapshots[i]),
  );
}

const previousManifest =
  (await readJsonIfExists(path.join(OUT_DATA, 'manifest.json'))) ?? {};
const legacySnapshotIds = new Set(
  Array.isArray(previousManifest.legacySnapshotIds)
    ? previousManifest.legacySnapshotIds
    : [],
);
if (previousManifest.snapshotId && previousManifest.snapshotId !== snapshotId) {
  legacySnapshotIds.add(previousManifest.snapshotId);
}
legacySnapshotIds.delete(snapshotId);
for (const id of legacySnapshotIds) {
  if (typeof id !== 'string' || !/^snap-[0-9a-f]{12}$/.test(id)) {
    legacySnapshotIds.delete(id);
  }
}

const manifest = {
  schemaVersion: SCHEMA_VERSION,
  snapshotId,
  legacySnapshotIds: [...legacySnapshotIds].sort(),
  rulesetId: RULESET.rulesetId,
  stage: 'preview',
  publishedAt: PUBLISHED_AT,
  checkedAt: CHECKED_AT,
  gameBuild: GAME_BUILD,
  sourceDigest: sha256(JSON.stringify(raw.talents)),
  sourceFileSha256: RAW_SHA256,
  sources: [
    {
      sourceId: 'src-talentsforever',
      url: 'https://talentsforever.com/data.json',
      publisher: 'talentsforever.com',
      recordedAt: RECORDED_AT,
      license: 'CC-BY-4.0',
      reviewStatus: 'reviewed',
    },
  ],
  classes: classFiles,
  coverage,
  ruleset: RULESET,
};

const previousRegistry =
  (await readJsonIfExists(path.join(OUT_MAP, 'id-registry.json'))) ?? {};
const mergedRegistry = {};
for (const id of Object.keys(idRegistry).sort()) {
  mergedRegistry[id] = {
    classId: idRegistry[id].classId,
    sourceName: idRegistry[id].sourceName,
    sourceTree: idRegistry[id].sourceTree,
    status: 'active',
    aliasOf: null,
  };
}
for (const id of Object.keys(previousRegistry).sort()) {
  if (mergedRegistry[id]) continue;
  const entry = previousRegistry[id];
  const aliasOf = RENAMES[id] ?? null;
  mergedRegistry[id] = {
    classId: entry.classId,
    sourceName: entry.sourceName,
    sourceTree: entry.sourceTree,
    status: aliasOf ? 'renamed' : 'removed',
    aliasOf,
  };
}
for (const [from, to] of Object.entries(RENAMES)) {
  if (!previousRegistry[from] && !mergedRegistry[from]) {
    fail(`RENAMES lists ${from}, which is in neither the previous nor the new data`);
  }
  if (!mergedRegistry[to]) fail(`RENAMES target ${to} is not in the registry`);
}
// Resolve alias chains (A -> B -> C) so every old ID points straight at a
// talent that exists now. An alias whose final target is gone becomes a
// plain removal (its points are refunded).
for (const [id, entry] of Object.entries(mergedRegistry)) {
  if (entry.status !== 'renamed') continue;
  const seen = new Set([id]);
  let target = entry.aliasOf;
  while (target && mergedRegistry[target]?.status === 'renamed') {
    if (seen.has(target)) fail(`alias cycle at ${target}`);
    seen.add(target);
    target = mergedRegistry[target].aliasOf;
  }
  if (target && mergedRegistry[target]?.status === 'active') {
    entry.aliasOf = target;
  } else {
    entry.status = 'removed';
    entry.aliasOf = null;
  }
}
const orderedRegistry = Object.fromEntries(
  Object.keys(mergedRegistry)
    .sort()
    .map((id) => [id, mergedRegistry[id]]),
);

await writeFile(
  path.join(OUT_DATA, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
await writeFile(
  path.join(OUT_GEN, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
await writeFile(
  path.join(OUT_MAP, 'id-registry.json'),
  JSON.stringify(orderedRegistry, null, 2),
);

console.log(`snapshotId: ${snapshotId}`);
console.log(`classes: ${classFiles.length}, talents: ${coverage.talentCount}`);
console.log(
  `ranks: ${coverage.ranksTotal} total, ${coverage.ranksWithText} with text, ` +
    `${coverage.ranksCommunityRecorded} recorded, ${coverage.ranksSourceEstimate} estimate, ` +
    `${coverage.ranksUnknown} unknown`,
);
console.log(
  `prerequisites: ${coverage.prerequisitesResolved}/${coverage.prerequisitesTotal} resolved`,
);
