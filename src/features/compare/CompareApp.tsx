/**
 * A/B build comparison island (PRD §7.5). Compares two builds of the same
 * class on the same snapshot: saved local builds or pasted share links.
 * Reports factual rank differences only — never percentage gains.
 */
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type {
  Build,
  ClassSnapshot,
  CompareResult,
  StoredBuild,
} from '@domain/talents/types';
import { compareBuilds, spentPoints, validateBuild } from '@domain/talents/rules';
import { decodeBuild, payloadFromHash } from '@domain/sharing/codec';
import { allowedSnapshotIds, migrateBuild } from '@domain/sharing/migrate';
import { talentRegistry } from '@data/talentRegistry';
import { getBuild, listBuilds } from '@features/builds/storage';
import type { SiteManifest } from '@data/loadSnapshot';
import { ruleErrorMessage } from '@components/calculator/messages';
import styles from './compare.module.css';

export interface CompareAppProps {
  manifest: SiteManifest;
}

type Side = { build: Build; label: string };

type ResolveResult = { ok: true; side: Side } | { ok: false; message: string };

interface LoadedResult {
  cmp: CompareResult;
  snapshot: ClassSnapshot;
  labelA: string;
  labelB: string;
}

function extractPayload(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex >= 0) {
    const fromHash = payloadFromHash(trimmed.slice(hashIndex));
    if (fromHash) return fromHash;
  }
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

async function fetchSnapshot(path: string): Promise<ClassSnapshot> {
  let lastError: unknown = new Error('fetch failed');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ClassSnapshot;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export default function CompareApp({ manifest }: CompareAppProps): JSX.Element {
  const ruleset = manifest.ruleset;
  const [builds, setBuilds] = useState<StoredBuild[]>([]);
  const [selA, setSelA] = useState('');
  const [selB, setSelB] = useState('');
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadedResult | null>(null);
  const [mobileSide, setMobileSide] = useState<'a' | 'b'>('a');

  useEffect(() => {
    setBuilds(listBuilds());
  }, []);

  const resolveSide = (urlInput: string, selectedId: string, sideName: string): ResolveResult => {
    if (urlInput.trim()) {
      const payload = extractPayload(urlInput);
      if (!payload) {
        return {
          ok: false,
          message: `${sideName}: could not find a share payload in that input. Paste a full link or the #b= payload.`,
        };
      }
      const decoded = decodeBuild(payload, allowedSnapshotIds(manifest), ruleset);
      if (!decoded.ok) {
        return { ok: false, message: `${sideName}: ${ruleErrorMessage(decoded.error, ruleset)}` };
      }
      return { ok: true, side: { build: decoded.build, label: `Pasted link ${sideName}` } };
    }
    if (selectedId) {
      const stored = getBuild(selectedId);
      if (!stored) return { ok: false, message: `${sideName}: saved build not found.` };
      return { ok: true, side: { build: stored, label: stored.name } };
    }
    return { ok: false, message: `${sideName}: select a saved build or paste a share link.` };
  };

  const onCompare = async () => {
    setError(null);
    setResult(null);
    const a = resolveSide(urlA, selA, 'A');
    if (!a.ok) {
      setError(a.message);
      return;
    }
    const b = resolveSide(urlB, selB, 'B');
    if (!b.ok) {
      setError(b.message);
      return;
    }
    if (a.side.build.classId !== b.side.build.classId) {
      setError(
        `Builds must be the same class to compare (A: ${a.side.build.classId}, B: ${b.side.build.classId}).`,
      );
      return;
    }
    const file = manifest.classes.find((c) => c.classId === a.side.build.classId);
    if (!file) {
      setError(`Class ${a.side.build.classId} is not in the current manifest.`);
      return;
    }
    setLoading(true);
    try {
      const snapshot = await fetchSnapshot(file.path);
      const buildA = migrateBuild(
        a.side.build,
        manifest.snapshotId,
        talentRegistry,
        snapshot,
        ruleset,
      ).build;
      const buildB = migrateBuild(
        b.side.build,
        manifest.snapshotId,
        talentRegistry,
        snapshot,
        ruleset,
      ).build;
      const validA = validateBuild(buildA, snapshot, ruleset);
      const validB = validateBuild(buildB, snapshot, ruleset);
      if (!validA.valid) {
        setError(
          `Build A is not valid under the current rules: ${validA.errors[0] ? ruleErrorMessage(validA.errors[0], ruleset) : 'unknown reason'}`,
        );
        return;
      }
      if (!validB.valid) {
        setError(
          `Build B is not valid under the current rules: ${validB.errors[0] ? ruleErrorMessage(validB.errors[0], ruleset) : 'unknown reason'}`,
        );
        return;
      }
      const cmp = compareBuilds(buildA, buildB, snapshot);
      if ('error' in cmp) {
        setError(ruleErrorMessage(cmp.error, ruleset));
        return;
      }
      setResult({ cmp, snapshot, labelA: a.side.label, labelB: b.side.label });
    } catch {
      setError('Could not load the class data for comparison. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const buildOptionLabel = (b: StoredBuild) =>
    `${b.name} — ${b.classId} L${b.level} (${spentPoints(b.allocation)} pts)`;

  const summaryCard = (side: 'a' | 'b') => {
    if (!result) return null;
    const { cmp, snapshot } = result;
    const totals = side === 'a' ? cmp.treeTotalsA : cmp.treeTotalsB;
    const level = side === 'a' ? cmp.levelA : cmp.levelB;
    const label = side === 'a' ? result.labelA : result.labelB;
    const total = Object.values(totals).reduce((n, v) => n + v, 0);
    return (
      <section
        className={`${styles.summaryCard} ${mobileSide === side ? styles.summaryVisible : ''}`}
        aria-label={`Build ${side.toUpperCase()} summary`}
      >
        <h3>
          {side.toUpperCase()}: {label}
        </h3>
        <p>
          Level {level} · {total} points
        </p>
        <ul>
          {snapshot.trees.map((tree) => (
            <li key={tree.treeId}>
              {tree.name}: {totals[tree.treeId] ?? 0}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className={styles.compare}>
      <div className={styles.pickers}>
        {(['a', 'b'] as const).map((side) => {
          const sel = side === 'a' ? selA : selB;
          const setSel = side === 'a' ? setSelA : setSelB;
          const url = side === 'a' ? urlA : urlB;
          const setUrl = side === 'a' ? setUrlA : setUrlB;
          return (
            <fieldset key={side} className={styles.picker}>
              <legend>Build {side.toUpperCase()}</legend>
              <label className={styles.field}>
                Saved build
                <select
                  className={styles.select}
                  data-testid={`compare-select-${side}`}
                  value={sel}
                  onChange={(e) => setSel(e.target.value)}
                  aria-label={`Select saved build ${side.toUpperCase()}`}
                >
                  <option value="">— choose a saved build —</option>
                  {builds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {buildOptionLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Or paste a share link / payload
                <input
                  type="text"
                  className={styles.textInput}
                  data-testid={`compare-url-${side}`}
                  value={url}
                  placeholder="https://…/mage/#b=…"
                  onChange={(e) => setUrl(e.target.value)}
                  aria-label={`Share link for build ${side.toUpperCase()}`}
                />
              </label>
            </fieldset>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.button}
        data-testid="btn-compare"
        onClick={() => void onCompare()}
        disabled={loading}
      >
        {loading ? 'Loading…' : 'Compare'}
      </button>

      {error ? (
        <p className={styles.errorLine} role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className={styles.result} data-testid="compare-result">
          {result.cmp.levelA !== result.cmp.levelB ? (
            <p className={styles.levelNotice} role="status">
              Levels differ (A: {result.cmp.levelA}, B: {result.cmp.levelB}). Point differences
              reflect the level budget — they do not show which build is better.
            </p>
          ) : null}

          <p className={styles.stats}>
            {result.cmp.pointsMoved} points moved · {result.cmp.pointsOnlyInA} only in A ·{' '}
            {result.cmp.pointsOnlyInB} only in B · {result.cmp.nodesChanged} talents changed
          </p>

          <div className={styles.mobileSideSwitch}>
            <button
              type="button"
              className={styles.buttonSecondary}
              aria-pressed={mobileSide === 'a'}
              onClick={() => setMobileSide('a')}
            >
              A summary
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              aria-pressed={mobileSide === 'b'}
              onClick={() => setMobileSide('b')}
            >
              B summary
            </button>
          </div>

          <div className={styles.summaries}>
            {summaryCard('a')}
            {summaryCard('b')}
          </div>

          <table className={styles.treeTable}>
            <caption className="visually-hidden">Points per tree, A versus B</caption>
            <thead>
              <tr>
                <th scope="col">Tree</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {result.snapshot.trees.map((tree) => (
                <tr key={tree.treeId}>
                  <th scope="row">{tree.name}</th>
                  <td>{result.cmp.treeTotalsA[tree.treeId] ?? 0}</td>
                  <td>{result.cmp.treeTotalsB[tree.treeId] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.cmp.diffs.length === 0 ? (
            <p>The two builds allocate points identically.</p>
          ) : (
            <table className={styles.diffTable} data-testid="compare-diff-list">
              <caption className="visually-hidden">Talent rank differences</caption>
              <thead>
                <tr>
                  <th scope="col">Talent</th>
                  <th scope="col">Tree</th>
                  <th scope="col">A rank</th>
                  <th scope="col">B rank</th>
                  <th scope="col">Δ</th>
                </tr>
              </thead>
              <tbody>
                {result.cmp.diffs.map((d) => {
                  const treeName =
                    result.snapshot.trees.find((t) => t.treeId === d.treeId)?.name ?? d.treeId;
                  return (
                    <tr key={d.talentId}>
                      <th scope="row">{d.name}</th>
                      <td>{treeName}</td>
                      <td>{d.rankA}</td>
                      <td>{d.rankB}</td>
                      <td className={d.delta > 0 ? styles.deltaUp : styles.deltaDown}>
                        {d.delta > 0 ? `+${d.delta}` : d.delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
