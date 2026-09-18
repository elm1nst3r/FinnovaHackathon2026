import type { KeyValueStore } from './storage.ts';

/**
 * Whether regula.dot checks prompts on its own. Off means nothing is
 * intercepted on Enter; instead the right-click menu offers "Ask regula.dot"
 * on any selection. Absent means on: a fresh install guards.
 */
export const ACTIVE_KEY = 'aig.active';

export async function readActive(store: KeyValueStore): Promise<boolean> {
  return (await store.get<boolean>(ACTIVE_KEY)) ?? true;
}
