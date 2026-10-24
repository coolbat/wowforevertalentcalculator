/**
 * Core domain contracts for the WoW Forever talent calculator.
 * These types are the frozen interface between the data pipeline,
 * the rules engine, the sharing protocol, and the UI. See PRD §12.
 */

// ---------- Version dimensions (PRD §10.1) ----------

export type SchemaVersion = number;
export type RulesetId = string;
export type SnapshotId = string;
export type BudgetProfile = 'standard';

// ---------- Evidence status (PRD §9.3) ----------

export type EvidenceStatus =
  | 'official'
  | 'client_verified'
  | 'footage_verified'
  | 'community_recorded'
  | 'source_estimate'
  | 'unverified'
  | 'unknown';

// ---------- Snapshot data model (PRD §12.1) ----------

export interface SourceRecord {
  sourceId: string;
  url: string;
  publisher: string;
  recordedAt: string; // ISO date
  license: string | null;
  reviewStatus: 'reviewed' | 'pending';
}

export interface RankEffect {
  rank: number;
  text: string | null; // null = unknown effect text
  evidenceStatus: EvidenceStatus;
  sourceIds: string[];
}

export interface ClassicReference {
  status: 'unchanged' | 'changed' | 'moved' | 'removed' | 'new' | 'unknown';
  tree: string | null;
  row: number | null; // 0-based after normalization
  column: number | null; // 0-based after normalization
  maxRank: number | null;
  text: string | null;
  evidenceStatus: EvidenceStatus;
}

export interface TalentPrerequisite {
  talentId: string;
  requiredRank: number;
}

export interface TalentNode {
  talentId: string; // stable ID, never derived from grid position
  treeId: string;
  name: string;
  row: number; // 0-based
  column: number; // 0-based
  maxRank: number;
  requiredEarlierPoints: number; // points required in earlier rows of the same tree
  prerequisites: TalentPrerequisite[];
  rankEffects: RankEffect[];
  passive: boolean;
  cost: string | null; // e.g. "Instant | 3 min cooldown"
  requirementText: string | null; // non-point requirements, e.g. "Requires Bear Form"
  iconRef: string; // icon identifier; UI renders a neutral placeholder
  classic: ClassicReference | null;
  note: string | null;
}

export interface RemovedClassicTalent {
  name: string;
  tree: string;
  row: number | null;
  column: number | null;
  text: string | null;
  note: string | null;
}

export interface TalentTree {
  treeId: string;
  classId: string;
  name: string;
  nameZh: string | null;
  grid: { rows: number; columns: number };
  talentIds: string[];
  removedClassic: RemovedClassicTalent[];
}

export interface ClassDefinition {
  classId: string;
  name: string; // English display name
  nameZh: string; // Simplified Chinese display name
  color: string; // class color hex
  treeIds: string[];
  iconRef: string;
}

export interface CoverageSummary {
  structureReviewed: boolean;
  talentCount: number;
  ranksTotal: number;
  ranksWithText: number;
  ranksCommunityRecorded: number;
  ranksSourceEstimate: number;
  ranksUnknown: number;
  prerequisitesResolved: number;
  prerequisitesTotal: number;
}

export interface ClassFile {
  classId: string;
  path: string; // content-hashed path, e.g. /data/classes/<hash>.json
  digest: string;
}

export interface DatasetManifest {
  schemaVersion: SchemaVersion;
  snapshotId: SnapshotId;
  /** Earlier published snapshot IDs whose share links still decode. */
  legacySnapshotIds?: SnapshotId[];
  rulesetId: RulesetId;
  stage: 'preview' | 'beta' | 'live';
  publishedAt: string; // ISO date this snapshot was published
  /** ISO date the upstream export was last fetched and compared. */
  checkedAt?: string;
  gameBuild: string | null;
  sourceDigest: string;
  /** sha256 of the raw upstream file as fetched. */
  sourceFileSha256?: string;
  sources: SourceRecord[];
  classes: ClassFile[];
  coverage: CoverageSummary;
}

export interface ClassSnapshot {
  schemaVersion: SchemaVersion;
  snapshotId: SnapshotId;
  rulesetId: RulesetId;
  classDef: ClassDefinition;
  trees: TalentTree[];
  talents: TalentNode[];
}

// ---------- Ruleset (PRD §8) ----------

export interface Ruleset {
  rulesetId: RulesetId;
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  maxBudget: number; // 51 for standard
  pointsStartLevel: number; // first talent point at level 10
  pointsPerRowTier: number; // 5 earlier points per row tier
}

// ---------- Build (PRD §12.1) ----------

/** allocation: talentId -> rank, zero ranks omitted */
export type Allocation = Record<string, number>;

export interface Build {
  classId: string;
  level: number;
  budgetProfile: BudgetProfile;
  schemaVersion: SchemaVersion;
  snapshotId: SnapshotId;
  rulesetId: RulesetId;
  allocation: Allocation;
}

export interface StoredBuild extends Build {
  id: string; // UUID
  name: string; // max 80 chars
  createdAt: string;
  updatedAt: string;
}

// ---------- Rule errors (PRD §12.2) ----------

export type RuleErrorCode =
  | 'POINT_BUDGET_EXCEEDED'
  | 'RANK_LIMIT'
  | 'ROW_REQUIREMENT'
  | 'PREREQUISITE'
  | 'UNKNOWN_NODE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_PAYLOAD'
  | 'STORAGE_UNAVAILABLE'
  | 'LEVEL_RANGE'
  | 'UNKNOWN_CLASS'
  | 'UNKNOWN_SNAPSHOT';

export interface RuleError {
  code: RuleErrorCode;
  message: string;
  nodeId?: string;
  details?: Record<string, unknown>;
}

// ---------- Rule API types (PRD §12.2) ----------

export interface ValidationResult {
  valid: boolean;
  errors: RuleError[];
  totals: { spent: number; budget: number; perTree: Record<string, number> };
}

export type AvailabilityReason =
  | 'ok'
  | 'budget_exceeded'
  | 'rank_maxed'
  | 'rank_zero'
  | 'row_requirement'
  | 'prerequisite'
  | 'dependents'
  | 'unknown_node';

export interface NodeAvailability {
  canAdd: boolean;
  canRemove: boolean;
  addReason: AvailabilityReason;
  removeReason: AvailabilityReason;
  /** node IDs that depend on this node and would break on removal */
  blockingDependents: string[];
}

export type BuildAction =
  | { type: 'add'; talentId: string }
  | { type: 'remove'; talentId: string }
  | { type: 'resetTree'; treeId: string }
  | { type: 'resetAll' }
  | { type: 'setLevel'; level: number }
  | { type: 'load'; allocation: Allocation; level: number };

export interface ActionResult {
  ok: boolean;
  build: Build; // original build on failure
  errors: RuleError[];
}

// ---------- Compare (PRD §7.5) ----------

export interface NodeDiff {
  talentId: string;
  treeId: string;
  name: string;
  rankA: number;
  rankB: number;
  delta: number; // rankB - rankA
}

export interface CompareResult {
  classId: string;
  snapshotId: SnapshotId;
  levelA: number;
  levelB: number;
  treeTotalsA: Record<string, number>;
  treeTotalsB: Record<string, number>;
  diffs: NodeDiff[]; // sorted by tree order, then row, then column
  nodesChanged: number;
  pointsMoved: number; // min(pointsRemoved, pointsAdded) — "moved" points
  pointsOnlyInA: number;
  pointsOnlyInB: number;
}

// ---------- Share payload (PRD §12.3) ----------

export interface SharePayloadV1 {
  v: 1; // schemaVersion
  s: SnapshotId;
  r: RulesetId;
  c: string; // classId
  l: number; // level
  b: BudgetProfile;
  a: Allocation; // non-zero ranks only
}

export const SHARE_SCHEMA_VERSION = 1 as const;
export const SHARE_MAX_ENCODED_BYTES = 12 * 1024;
export const SHARE_MAX_DECODED_BYTES = 32 * 1024;

export type DecodeResult =
  | { ok: true; build: Build }
  | { ok: false; error: RuleError };
