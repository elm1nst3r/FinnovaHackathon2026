import type { DecisionResult } from '../core/engine.ts';
import type { Classification, DetectionCategory, LocalHistoryEntry } from '../core/model.ts';
import type { KeyValueStore } from './storage.ts';

export const HISTORY_KEY = 'aig.history';

export const MAX_ENTRIES = 200;
export const RETENTION_DAYS = 30;

export interface HistoryInput {
  toolId: string;
  toolLabel: string;
  classification: Classification;
  detectedCategories: DetectionCategory[];
  result: DecisionResult;
  policySetVersion: string;
  at: Date;
}

/**
 * Builds the entry field by field from the decision, never from the prompt. The
 * prompt is not a parameter of this function, so it cannot end up in the store
 * by a later mistake either.
 */
export function toHistoryEntry(input: HistoryInput): LocalHistoryEntry {
  return {
    id: `lh-${input.at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: input.at.toISOString(),
    toolId: input.toolId,
    toolLabel: input.toolLabel,
    classification: input.classification,
    decision: input.result.decision,
    policyIds: input.result.reasons.map((reason) => reason.policyId),
    suppressedPolicyIds: [...input.result.suppressedPolicyIds],
    detectedCategories: [...input.detectedCategories],
    policySetVersion: input.policySetVersion,
  };
}

export function prune(entries: LocalHistoryEntry[], now: Date): LocalHistoryEntry[] {
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return entries
    .filter((entry) => new Date(entry.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ENTRIES);
}

export async function readHistory(store: KeyValueStore, now: Date): Promise<LocalHistoryEntry[]> {
  const stored = (await store.get<LocalHistoryEntry[]>(HISTORY_KEY)) ?? [];
  const pruned = prune(stored, now);
  // Ageing is written back on read, so an entry past the retention window is
  // gone from the device, not merely hidden until the next decision happens.
  if (pruned.length !== stored.length) await store.set(HISTORY_KEY, pruned);
  return pruned;
}

export async function appendHistory(
  store: KeyValueStore,
  input: HistoryInput,
): Promise<LocalHistoryEntry> {
  const entry = toHistoryEntry(input);
  const existing = (await store.get<LocalHistoryEntry[]>(HISTORY_KEY)) ?? [];
  await store.set(HISTORY_KEY, prune([entry, ...existing], input.at));
  return entry;
}

export async function clearHistory(store: KeyValueStore): Promise<void> {
  // No tombstone, no "history cleared" audit event. A record that somebody
  // cleared their history is still a record about them.
  await store.remove(HISTORY_KEY);
}
