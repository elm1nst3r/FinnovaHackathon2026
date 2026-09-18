const identity = document.querySelector<HTMLSelectElement>('#identity');
const active = document.querySelector<HTMLInputElement>('#active');
const mode = document.querySelector<HTMLElement>('#mode');
const version = document.querySelector<HTMLElement>('#version');
const staleness = document.querySelector<HTMLElement>('#staleness');

interface Status {
  identityId: string;
  version: string | null;
  staleness: string | null;
  active: boolean;
}

async function refresh(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({ type: 'AIG_STATUS' })) as Status;
  if (identity) identity.value = status.identityId;
  if (active) active.checked = status.active;
  if (mode) {
    mode.textContent = status.active
      ? 'Prompts to AI tools are checked before they leave.'
      : 'Off. Select text on any page and right-click “Ask regula.dot”.';
  }
  if (version) {
    version.textContent = status.version
      ? `Policy set ${status.version}`
      : 'No policy set fetched yet.';
  }
  if (staleness) staleness.textContent = status.staleness ?? '';
}

identity?.addEventListener('change', () => {
  void chrome.runtime
    .sendMessage({ type: 'AIG_SET_IDENTITY', identityId: identity.value })
    .then(() => refresh());
});

active?.addEventListener('change', () => {
  void chrome.runtime
    .sendMessage({ type: 'AIG_SET_ACTIVE', active: active.checked })
    .then(() => refresh());
});

void refresh();
