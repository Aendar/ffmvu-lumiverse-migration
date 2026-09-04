import type { JsonPatchOperation } from '../shared/json-patch.js';
import type { FFMVUState, PromptView } from '../shared/state-schema.js';

export const EVENT_FORMAT_VERSION = 2;
export const ACTIVE_PREFIX_FINGERPRINT_VERSION = 'ffmvu-active-prefix-v1';

export interface StateScope { userId: string; chatId: string }
export type VariantId = string;
export type LineageAnchorId = 'root' | VariantId;

export type BaseSnapshotKind = 'genesis' | 'fork' | 'legacy-import';
export type StateCommitKind = 'model' | 'gui' | 'system' | 'edit-rebuild' | 'migration' | 'repair';
export type AttemptStatus = 'committed' | 'no_patch' | 'failed_patch' | 'ignored' | 'stopped' | 'unreconciled';
export type AnchorStatus = AttemptStatus;

export interface TranscriptBaseBoundary {
  throughMessageId: string;
  activePrefixHash: string;
  fingerprintVersion: string;
}

export interface ProjectionSeed {
  projectionVersion: string;
  promptProtocolVersion: string;
  projection: PromptView;
  promptViewHash: string;
  provenance: 'fork-exact' | 'legacy-exact';
}

export interface ProjectionBinding {
  sourceKind: 'node' | 'base-seed';
  sourceNodeId?: string;
  sourceStateHash?: string;
  sourceBaseId?: string;
  projectionVersion: string;
  promptProtocolVersion: string;
  promptViewHash: string;
}

export interface BaseSnapshot {
  eventFormatVersion: number;
  id: string;
  scope: StateScope;
  kind: BaseSnapshotKind;
  stateSchemaVersion: string;
  reducerVersion: string;
  state: FFMVUState;
  stateHash: string;
  projectionBinding: ProjectionBinding;
  transcriptBoundary?: TranscriptBaseBoundary;
  projectionSeed?: ProjectionSeed;
  provenance?: Record<string, unknown>;
  createdAt: string;
}

export interface CommitAnchor {
  messageId?: string;
  variantId?: VariantId;
  generationId?: string;
  attemptId?: string;
  messageRole?: 'assistant' | 'user';
  lineageAnchorId?: LineageAnchorId;
}

export interface StateCommit {
  eventFormatVersion: number;
  id: string;
  scope: StateScope;
  kind: StateCommitKind;
  anchor: CommitAnchor;
  parentNodeId: string;
  parentStateHash: string;
  patch: JsonPatchOperation[];
  patchHash: string;
  reducerVersion: string;
  resultStateHash: string;
  projectionBinding: ProjectionBinding;
  transactionId: string;
  previousStoreRevisionId: string | null;
  previousStoreRevisionHash: string | null;
  requestId?: string;
  note?: string;
  createdAt: string;
}

export interface CommittedArtifactRef { type: 'base' | 'commit'; id: string; hash: string }

export interface ChatStoreRevision {
  eventFormatVersion: number;
  revisionId: string;
  scope: StateScope;
  previousStoreRevisionId: string | null;
  previousStoreRevisionHash: string | null;
  transactionId: string;
  committedArtifacts: CommittedArtifactRef[];
  semanticTipNodeId: string; // transaction-local semantic tip, NOT active transcript head
  semanticTipStateHash: string;
  createdAt: string;
}

export interface MaterializedState { nodeId: string; stateHash: string; state: FFMVUState }
export interface CheckpointRecord extends MaterializedState { eventFormatVersion: number; scope: StateScope; reducerVersion: string; createdAt: string }

export interface TranscriptAttempt {
  id: string;
  scope: StateScope;
  variantId: VariantId;
  messageId: string;
  generationId?: string;
  generationType: string;
  ordinal: number;
  baseNodeId: string;
  baseStateHash: string;
  projectionSourceKind: 'node' | 'base-seed';
  projectionSourceNodeId?: string;
  projectionSourceStateHash?: string;
  projectionSourceBaseId?: string;
  projectionVersion: string;
  promptProtocolVersion: string;
  promptViewHash: string;
  presetVersion?: string;
  modelCommitId: string | null;
  status: AttemptStatus;
  rawGenerationHash?: string;
  rawPatchPayloadHash?: string;
  canonicalPatchHash?: string;
  storedMessageTextHash: string;
  createdAt: string;
}

export interface AnchorRecord {
  variantId: VariantId;
  scope: StateScope;
  messageId: string;
  observedSwipeIndex: number;
  initialBaseNodeId: string;
  initialBaseStateHash: string;
  attemptIds: string[];
  lastAttemptId?: string;
  storedMessageTextHash: string;
  tipNodeId: string;
  status: AnchorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RootAnchorRecord {
  anchorId: 'root';
  scope: StateScope;
  baseNodeId: string;
  tipNodeId: string;
  updatedAt: string;
}

export interface MessageVariantIndex {
  messageId: string;
  bySwipeIndex: Record<number, VariantId>;
  swipeFingerprints: Record<VariantId, { storedMessageTextHash: string; swipeDate?: string }>;
  updatedAt: string;
}
