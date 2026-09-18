import type { LocalHistoryEntry } from '../core/model.ts';

export const BRIDGE_REQUEST = 'AIG_HISTORY_REQUEST';
export const BRIDGE_RESPONSE = 'AIG_HISTORY_RESPONSE';
export const BRIDGE_CLEAR = 'AIG_HISTORY_CLEAR';
export const BRIDGE_CLEARED = 'AIG_HISTORY_CLEARED';

const TIMEOUT_MS = 800;

export interface HistoryResult {
  available: boolean;
  entries: LocalHistoryEntry[];
}

/**
 * The employee's history never reaches a server, so the cockpit cannot fetch it.
 * The extension hands it over in-page instead, on this origin only.
 *
 * Both sides check `event.source === window` and the origin, so another frame
 * cannot ask for the history and the extension cannot be tricked into
 * broadcasting it to one.
 */
function ask<T>(type: string, responseType: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;

    const listener = (event: MessageEvent): void => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data['type'] !== responseType) return;

      settled = true;
      window.removeEventListener('message', listener);
      resolve(data['payload'] as T);
    };

    window.addEventListener('message', listener);
    window.postMessage({ type, ...payload }, window.location.origin);

    setTimeout(() => {
      if (settled) return;
      window.removeEventListener('message', listener);
      resolve(null);
    }, TIMEOUT_MS);
  });
}

export async function loadLocalHistory(): Promise<HistoryResult> {
  const entries = await ask<LocalHistoryEntry[]>(BRIDGE_REQUEST, BRIDGE_RESPONSE);
  return entries === null ? { available: false, entries: [] } : { available: true, entries };
}

export async function clearLocalHistory(): Promise<boolean> {
  const result = await ask<{ cleared: boolean }>(BRIDGE_CLEAR, BRIDGE_CLEARED);
  return result?.cleared === true;
}
