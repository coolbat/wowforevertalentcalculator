/**
 * Manually refresh the raw upstream export. Not part of `npm run build`.
 *
 *   npm run data:fetch
 *
 * Downloads https://talentsforever.com/data.json (CC BY 4.0), checks the
 * license field, and writes two files:
 *   data-raw/talentsforever-data.json   the bytes as served, unmodified
 *   data-raw/upstream-meta.json         fetch time, sha256, generated date
 *
 * `npm run data:import` (which `npm run build` runs) reads both. It refuses
 * to build if the raw file no longer matches the recorded sha256, so the
 * "checked" date shown on the site always belongs to the data next to it.
 *
 * After fetching, review the change with `npm run data:diff` and commit the
 * result through a normal pull request.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL_UPSTREAM = 'https://talentsforever.com/data.json';
const RAW_PATH = path.join(root, 'data-raw/talentsforever-data.json');
const META_PATH = path.join(root, 'data-raw/upstream-meta.json');

const res = await fetch(URL_UPSTREAM, {
  headers: {
    'user-agent':
      'wowforevertalentcalculator.com data sync (contact@wowforevertalentcalculator.com)',
    accept: 'application/json',
  },
});
if (!res.ok) {
  console.error(`FETCH FAILED: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());
const raw = JSON.parse(bytes.toString('utf8'));
if (raw.license !== 'CC-BY-4.0') {
  console.error(`FETCH FAILED: unexpected license ${JSON.stringify(raw.license)}`);
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.generated))) {
  console.error(`FETCH FAILED: bad generated date ${JSON.stringify(raw.generated)}`);
  process.exit(1);
}

const sha256 = createHash('sha256').update(bytes).digest('hex');
const fetchedAt = new Date().toISOString();
const meta = {
  url: URL_UPSTREAM,
  license: raw.license,
  generated: raw.generated,
  fetchedAt,
  checkedAt: fetchedAt.slice(0, 10),
  bytes: bytes.length,
  sha256,
};

await writeFile(RAW_PATH, bytes);
await writeFile(META_PATH, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`generated: ${meta.generated}`);
console.log(`fetched:   ${meta.fetchedAt}`);
console.log(`sha256:    ${sha256}`);
console.log(`bytes:     ${bytes.length}`);
