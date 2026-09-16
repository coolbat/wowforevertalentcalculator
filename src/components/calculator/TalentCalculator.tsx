/**
 * WoW Forever talent calculator — the main interactive island.
 *
 * State model: a single `Build` owned here; every allocation change goes
 * through applyAction (transactional). Successful states form an undo stack
 * (max 50); selection and panel expansion are not part of history.
 * Drafts autosave (300 ms debounce) unless the build is a read-only
 * external share or storage is unavailable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  Build,
  BuildAction,
  ClassSnapshot,
  NodeAvailability,
  TalentNode,
} from '@domain/talents/types';
import {
  applyAction,
  emptyBuild,
  getNodeAvailability,
  getPointBudget,
  minLevelForSpent,
  perTreeTotals,
  spentPoints,
  validateBuild,
} from '@domain/talents/rules';
import {
  buildShareUrl,
  decodeBuild,
  encodeBuild,
  payloadFromHash,
} from '@domain/sharing/codec';
import {
  MAX_NAME_LENGTH,
  loadDraft,
  saveDraft,
  saveNamedBuild,
  storageAvailable,
} from '@features/builds/storage';
import type { SiteManifest } from '@data/loadSnapshot';
import { TreePanel } from './TreePanel';
import { DetailPanel } from './DetailPanel';
import { ruleErrorMessage } from './messages';
import { useMediaQuery } from './useMediaQuery';
import styles from './calculator.module.css';

export interface TalentCalculatorProps {
  snapshot: ClassSnapshot;
  manifest: SiteManifest;
}

const HISTORY_LIMIT = 50;
const TOAST_MS = 4000;

type ToastKind = 'error' | 'ok';
interface Toast {
  kind: ToastKind;
  message: string;
  id: number;
}

type PageState =
  | { status: 'ready'; readOnly: boolean }
  | { status: 'error'; message: string; url: string }
  | { status: 'conflict'; payloadClassId: string };

export default function TalentCalculator(props: TalentCalculatorProps): JSX.Element {
  const { snapshot, manifest } = props;
  const ruleset = manifest.ruleset;
  const classId = snapshot.classDef.classId;
  const structureOk = manifest.coverage.structureReviewed;

  const [build, setBuild] = useState<Build>(() =>
    emptyBuild(classId, manifest.snapshotId, ruleset),
  );
  const [page, setPage] = useState<PageState>({ status: 'ready', readOnly: false });
  const [past, setPast] = useState<Build[]>([]);
  const [future, setFuture] = useState<Build[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTreeId, setActiveTreeId] = useState(snapshot.trees[0]?.treeId ?? '');
  const [toast, setToast] = useState<Toast | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [levelText, setLevelText] = useState(String(ruleset.defaultLevel));
  const [saveName, setSaveName] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const buildRef = useRef(build);
  const pageRef = useRef(page);
  const selectedIdRef = useRef(selectedId);
  const pastRef = useRef<Build[]>([]);
  const futureRef = useRef<Build[]>([]);
  const initializedRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    buildRef.current = build;
  }, [build]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    setLevelText(String(build.level));
  }, [build.level]);

  // ---- Toast: transient feedback (rule errors, save/share confirmations)
  // shown as a floating overlay so the tree grid never shifts. ----
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    setToast((prev) => ({ kind, message, id: (prev?.id ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [toast]);

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
  }, []);

  // ---- Initialization (client only): share link > draft > blank. ----
  useEffect(() => {
    if (!storageAvailable()) setStorageWarning(true);
    const url = window.location.href;
    const payload = payloadFromHash(window.location.hash);
    if (payload) {
      const decoded = decodeBuild(payload, [manifest.snapshotId], ruleset);
      if (!decoded.ok) {
        setPage({ status: 'error', message: ruleErrorMessage(decoded.error, ruleset), url });
      } else if (decoded.build.classId !== classId) {
        if (manifest.classes.some((c) => c.classId === decoded.build.classId)) {
          setBuild(decoded.build);
          setPage({ status: 'conflict', payloadClassId: decoded.build.classId });
        } else {
          setPage({
            status: 'error',
            message: ruleErrorMessage(
              { code: 'UNKNOWN_CLASS', message: 'unknown class in payload' },
              ruleset,
            ),
            url,
          });
        }
      } else {
        const validation = validateBuild(decoded.build, snapshot, ruleset);
        if (!validation.valid) {
          const first = validation.errors[0];
          setPage({
            status: 'error',
            message: first
              ? ruleErrorMessage(first, ruleset)
              : 'This build is not valid under the current rules.',
            url,
          });
        } else {
          setBuild(decoded.build);
          setPage({ status: 'ready', readOnly: true });
        }
      }
    } else {
      const draft = loadDraft(classId, manifest.snapshotId);
      if (draft && validateBuild(draft, snapshot, ruleset).valid) {
        setBuild(draft);
      }
      // An invalid or stale draft is left untouched in storage but not restored.
    }
    resetHistory();
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Transactional dispatch: all allocation changes go through applyAction. ----
  const dispatch = useCallback(
    (action: BuildAction): boolean => {
      const p = pageRef.current;
      if (p.status !== 'ready' || p.readOnly || !structureOk) return false;
      // Capture the pre-action build synchronously: updater functions run
      // during the later render, by which time buildRef already points at
      // the new state.
      const prevBuild = buildRef.current;
      const result = applyAction(prevBuild, action, snapshot, ruleset);
      if (!result.ok) {
        const first = result.errors[0];
        showToast('error', first ? ruleErrorMessage(first, ruleset) : 'That change is not allowed.');
        return false;
      }
      const newPast = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), prevBuild];
      pastRef.current = newPast;
      futureRef.current = [];
      setPast(newPast);
      setFuture([]);
      buildRef.current = result.build;
      setBuild(result.build);
      setToast((t) => (t?.kind === 'error' ? null : t));
      return true;
    },
    [snapshot, ruleset, structureOk, showToast],
  );

  const handleAdd = useCallback((id: string) => dispatch({ type: 'add', talentId: id }), [dispatch]);
  const handleRemove = useCallback(
    (id: string) => dispatch({ type: 'remove', talentId: id }),
    [dispatch],
  );
  const handleResetTree = useCallback(
    (treeId: string) => {
      const tree = snapshot.trees.find((t) => t.treeId === treeId);
      if (!tree) return;
      const hasPoints = tree.talentIds.some((id) => (buildRef.current.allocation[id] ?? 0) > 0);
      if (hasPoints) dispatch({ type: 'resetTree', treeId });
    },
    [dispatch, snapshot],
  );
  const handleResetAll = useCallback(() => {
    if (Object.keys(buildRef.current.allocation).length > 0) dispatch({ type: 'resetAll' });
  }, [dispatch]);
  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  const undo = useCallback(() => {
    const prev = pastRef.current;
    if (prev.length === 0) return;
    const last = prev[prev.length - 1];
    const newPast = prev.slice(0, -1);
    const newFuture = [buildRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT);
    pastRef.current = newPast;
    futureRef.current = newFuture;
    buildRef.current = last;
    setPast(newPast);
    setFuture(newFuture);
    setBuild(last);
  }, []);

  const redo = useCallback(() => {
    const prev = futureRef.current;
    if (prev.length === 0) return;
    const [next, ...rest] = prev;
    const newPast = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), buildRef.current];
    pastRef.current = newPast;
    futureRef.current = rest;
    buildRef.current = next;
    setPast(newPast);
    setFuture(rest);
    setBuild(next);
  }, []);

  // ---- Draft autosave: 300 ms debounce after each legal change + final flush. ----
  const flushSave = useCallback(() => {
    if (!dirtyRef.current) return;
    const p = pageRef.current;
    if (p.status !== 'ready' || p.readOnly) return;
    const result = saveDraft(buildRef.current);
    dirtyRef.current = false;
    if (!result.ok) setStorageWarning(true);
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (page.status !== 'ready' || page.readOnly) return;
    dirtyRef.current = true;
    const timer = window.setTimeout(flushSave, 300);
    return () => window.clearTimeout(timer);
  }, [build, page, flushSave]);

  useEffect(() => {
    const onPageHide = () => flushSave();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushSave]);

  // Flush pending changes on unmount (e.g. in-page class switch on the home
  // page), so an in-flight debounced draft is never lost.
  useEffect(() => () => flushSave(), [flushSave]);

  // ---- Derived data (memoized for tree rendering). ----
  const availability = useMemo(() => {
    const map = new Map<string, NodeAvailability>();
    for (const t of snapshot.talents) {
      map.set(t.talentId, getNodeAvailability(t.talentId, build, snapshot, ruleset));
    }
    return map;
  }, [build, snapshot, ruleset]);

  const nodesByTree = useMemo(() => {
    const map = new Map<string, TalentNode[]>();
    for (const tree of snapshot.trees) {
      map.set(
        tree.treeId,
        snapshot.talents.filter((t) => t.treeId === tree.treeId),
      );
    }
    return map;
  }, [snapshot]);

  const treeTotals = useMemo(
    () => perTreeTotals(build.allocation, snapshot),
    [build.allocation, snapshot],
  );

  const budgetResult = getPointBudget(build.level, build.budgetProfile, ruleset);
  const budget = typeof budgetResult === 'number' ? budgetResult : 0;
  const spent = spentPoints(build.allocation);
  const remaining = Math.max(0, budget - spent);

  const selectedNode = selectedId
    ? (snapshot.talents.find((t) => t.talentId === selectedId) ?? null)
    : null;

  // ---- Toolbar actions. ----
  const editable = page.status === 'ready' && !page.readOnly && structureOk;

  const onLevelChange = (value: string) => {
    setLevelText(value);
    if (value === '') return;
    const n = Number(value);
    if (Number.isInteger(n) && n >= ruleset.minLevel && n <= ruleset.maxLevel) {
      dispatch({ type: 'setLevel', level: n });
    }
  };

  const onSaveNamed = () => {
    const result = saveNamedBuild(buildRef.current, saveName);
    if (result.ok) {
      showToast('ok', `Saved “${result.value.name}”. Find it under My Builds.`);
      setSaveName('');
    } else {
      showToast('error', `Could not save: ${result.error.message}`);
      if (result.error.code === 'STORAGE_UNAVAILABLE') setStorageWarning(true);
    }
  };

  const onShare = async () => {
    try {
      const url = buildShareUrl(window.location.origin, classId, encodeBuild(buildRef.current));
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        showToast('ok', 'Share link copied to clipboard.');
      } catch {
        showToast('ok', 'Copy the full link below.');
      }
    } catch {
      showToast('error', 'Could not create a share link for this build.');
    }
  };

  const canSystemShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const onSystemShare = async () => {
    if (!shareUrl || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: 'WoW Forever talent build', url: shareUrl });
    } catch {
      // user dismissed or share failed; the copyable link stays visible
    }
  };

  // ---- External build / error / conflict flows. ----
  const onEditCopy = () => {
    const result = saveDraft(buildRef.current);
    if (!result.ok) setStorageWarning(true);
    else dirtyRef.current = false;
    resetHistory();
    setPage({ status: 'ready', readOnly: false });
    window.history.replaceState(null, '', window.location.pathname);
  };

  const onNewBlank = () => {
    const blank = emptyBuild(classId, manifest.snapshotId, ruleset);
    buildRef.current = blank;
    setBuild(blank);
    resetHistory();
    setSelectedId(null);
    setPage({ status: 'ready', readOnly: false });
    window.history.replaceState(null, '', window.location.pathname);
  };

  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      const current = selectedIdRef.current;
      if (current) {
        handleSelect(null);
        nodeRefs.current.get(current)?.focus();
      }
    }
  };

  const onCloseDetail = () => {
    const current = selectedIdRef.current;
    handleSelect(null);
    if (current) nodeRefs.current.get(current)?.focus();
  };

  const classStyle = { '--class-color': `var(--class-${classId})` } as CSSProperties;

  return (
    <div className={styles.calculator} style={classStyle} onKeyDown={onRootKeyDown}>
      {storageWarning ? (
        <p className={styles.warningBanner} data-testid="storage-warning" role="status">
          Not saved to this device — copying a share link still works
        </p>
      ) : null}

      {!structureOk ? (
        <p className={styles.warningBanner} role="status">
          Preview / reference only — this class structure has not been reviewed, so allocation is
          disabled.
        </p>
      ) : null}

      {page.status === 'ready' && page.readOnly ? (
        <div className={styles.infoBanner} data-testid="external-banner" role="status">
          <p>
            You are viewing a shared build (snapshot {manifest.snapshotId}, level {build.level}).
            It is read-only until you edit a copy — your local draft is untouched.
          </p>
          <button type="button" className={styles.button} data-testid="btn-edit-copy" onClick={onEditCopy}>
            Edit a copy
          </button>
        </div>
      ) : null}

      {page.status === 'error' ? (
        <div className={styles.errorPanel} data-testid="error-panel" role="alert">
          <h2>This share link could not be opened</h2>
          <p>{page.message}</p>
          <p>Your local draft was not changed. The original link is shown below as plain text:</p>
          <input
            type="text"
            readOnly
            className={styles.linkOutput}
            value={page.url}
            aria-label="Original link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={styles.button} data-testid="btn-new-blank" onClick={onNewBlank}>
            Start a new blank build
          </button>
        </div>
      ) : null}

      {page.status === 'conflict' ? (
        <div className={styles.infoBanner} role="alert">
          <p>
            This link contains a <strong>{page.payloadClassId}</strong> build, but you are on the{' '}
            <strong>{classId}</strong> page. Open the build on its own class page instead?
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              window.location.assign(`/${page.payloadClassId}/${window.location.hash}`);
            }}
          >
            Open {page.payloadClassId} build
          </button>
          <button type="button" className={styles.buttonSecondary} onClick={onNewBlank}>
            Stay here with a blank build
          </button>
        </div>
      ) : null}

      {page.status !== 'error' ? (
        <>
          <p className={styles.dataLine}>
            {snapshot.classDef.name} talents · {manifest.stage} data · published{' '}
            {manifest.publishedAt} · Legacy early-point effects are not included in the standard
            budget.
          </p>

          <div className={styles.toolbar}>
            <label className={styles.levelLabel}>
              Level
              <input
                type="number"
                data-testid="level-input"
                className={styles.levelInput}
                min={ruleset.minLevel}
                max={ruleset.maxLevel}
                value={levelText}
                disabled={!editable}
                aria-label="Character level"
                onChange={(e) => onLevelChange(e.target.value)}
                onBlur={() => setLevelText(String(build.level))}
              />
            </label>
            <span
              className={styles.pointsRemaining}
              data-testid="points-remaining"
              aria-label={`${remaining} of ${budget} points remaining`}
            >
              {remaining} / {budget}
            </span>
            <span className={styles.minLevelNote}>
              {spent === 0
                ? 'No points spent yet'
                : `Needs at least level ${minLevelForSpent(spent, ruleset)}`}
            </span>
            <div className={styles.toolbarButtons}>
              <button
                type="button"
                className={styles.buttonSecondary}
                data-testid="btn-undo"
                onClick={undo}
                disabled={past.length === 0 || !editable}
                aria-label="Undo last change"
              >
                Undo
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                data-testid="btn-redo"
                onClick={redo}
                disabled={future.length === 0 || !editable}
                aria-label="Redo"
              >
                Redo
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                data-testid="btn-reset-all"
                onClick={handleResetAll}
                aria-disabled={!editable || spent === 0 || undefined}
                aria-label="Reset all trees"
              >
                Reset all
              </button>
              <a className={styles.compareLink} href="/compare/">
                Compare builds
              </a>
            </div>
          </div>

          <div className={styles.saveRow}>
            <input
              type="text"
              className={styles.textInput}
              data-testid="save-build-name"
              value={saveName}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Build name"
              aria-label="Build name"
              disabled={!editable}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button
              type="button"
              className={styles.button}
              data-testid="btn-save-build"
              onClick={onSaveNamed}
              disabled={!editable || saveName.trim().length === 0}
            >
              Save build
            </button>
            <button
              type="button"
              className={styles.button}
              data-testid="btn-share"
              onClick={() => void onShare()}
            >
              Share
            </button>
            {canSystemShare && shareUrl ? (
              <button type="button" className={styles.buttonSecondary} onClick={() => void onSystemShare()}>
                System share
              </button>
            ) : null}
          </div>

          {shareUrl ? (
            <input
              type="text"
              readOnly
              className={styles.linkOutput}
              data-testid="link-output"
              value={shareUrl}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : null}
          {toast ? (
            <div
              key={toast.id}
              className={`${styles.toast} ${toast.kind === 'error' ? styles.toastError : styles.toastOk}`}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              data-testid="action-toast"
            >
              {toast.message}
            </div>
          ) : null}

          <p className="visually-hidden" role="status" aria-live="polite">
            {spent} of {budget} points spent, {remaining} remaining.
          </p>

          <div className={styles.tabs} role="tablist" aria-label="Talent trees">
            {snapshot.trees.map((tree) => (
              <button
                key={tree.treeId}
                type="button"
                role="tab"
                aria-selected={activeTreeId === tree.treeId}
                className={`${styles.tab} ${activeTreeId === tree.treeId ? styles.tabActive : ''}`}
                data-testid={`tree-tab-${tree.treeId}`}
                onClick={() => setActiveTreeId(tree.treeId)}
              >
                {tree.name}
                <span className={styles.tabPoints}>{treeTotals[tree.treeId] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className={styles.layout}>
            <div className={styles.trees}>
              {snapshot.trees.map((tree) => (
                <TreePanel
                  key={tree.treeId}
                  tree={tree}
                  nodes={nodesByTree.get(tree.treeId) ?? []}
                  build={build}
                  availability={availability}
                  selectedId={selectedId}
                  readOnly={!editable}
                  isMobile={isMobile}
                  activeOnMobile={activeTreeId === tree.treeId}
                  points={treeTotals[tree.treeId] ?? 0}
                  onSelect={handleSelect}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  onResetTree={handleResetTree}
                  nodeRefs={nodeRefs}
                />
              ))}
            </div>
            <DetailPanel
              node={selectedNode}
              build={build}
              snapshot={snapshot}
              manifest={manifest}
              availability={selectedId ? (availability.get(selectedId) ?? null) : null}
              readOnly={!editable}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onClose={onCloseDetail}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
