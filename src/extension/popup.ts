const identity = document.querySelector<HTMLSelectElement>('#identity');
const version = document.querySelector<HTMLElement>('#version');
const staleness = document.querySelector<HTMLElement>('#staleness');

interface Status {
  identityId: string;
  version: string | null;
  staleness: string | null;
}

async function refresh(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({ type: 'AIG_STATUS' })) as Status;
  if (identity) identity.value = status.identityId;
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

void refresh();
