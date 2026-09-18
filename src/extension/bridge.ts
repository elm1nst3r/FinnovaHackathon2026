import type { LocalHistoryEntry } from '../core/model.ts';

const REQUEST = 'AIG_HISTORY_REQUEST';
const RESPONSE = 'AIG_HISTORY_RESPONSE';
const CLEAR = 'AIG_HISTORY_CLEAR';
const CLEARED = 'AIG_HISTORY_CLEARED';

/**
 * The cockpit cannot fetch a personal history from a server, because there isn't
 * one. This bridge hands the local store to the cockpit page instead — same
 * device, same browser profile, same person.
 *
 * It only ever answers messages posted by this window on this origin, and it
 * replies to that origin explicitly. A framed page or another tab cannot ask.
 */
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data as Record<string, unknown> | null;
  if (!data) return;

  if (data['type'] === REQUEST) {
    void chrome.runtime
      .sendMessage({ type: 'AIG_HISTORY' })
      .then((reply: { entries: LocalHistoryEntry[] }) => {
        window.postMessage({ type: RESPONSE, payload: reply.entries }, window.location.origin);
      });
    return;
  }

  if (data['type'] === CLEAR) {
    void chrome.runtime.sendMessage({ type: 'AIG_HISTORY_CLEAR' }).then(() => {
      window.postMessage({ type: CLEARED, payload: { cleared: true } }, window.location.origin);
    });
  }
});
