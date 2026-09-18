import { decide, decideAcrossRegistry, findToolByHost } from '../core/engine.ts';
import type { DecisionResult } from '../core/engine.ts';
import type { Classification, DetectionCategory } from '../core/model.ts';
import { appendHistory, clearHistory, readHistory } from './history.ts';
import { seedDemoHistoryOnce } from './demo-history.ts';
import { chromeStore } from './storage.ts';
import { ACTIVE_KEY, readActive } from './active.ts';
import { toAskVerdicts } from './ask-verdict.ts';
import type { AskMessage, AskReply } from './ask-verdict.ts';
import { PolicySync, describeStaleness } from './sync.ts';
import type { SyncStatus } from './sync.ts';

const SERVICE_URL = 'http://cockpit.finnova.local';
const IDENTITY_KEY = 'aig.identity';
const DEFAULT_IDENTITY = 'u-anna';
const REFRESH_MINUTES = 15;

const store = chromeStore();

async function identityId(): Promise<string> {
  return (await store.get<string>(IDENTITY_KEY)) ?? DEFAULT_IDENTITY;
}

async function sync(): Promise<PolicySync> {
  return new PolicySync(store, { baseUrl: SERVICE_URL, identityId: await identityId() });
}

// -------------------------------------------------------------- messages

/**
 * Deliberately no free-text label: the page title of an AI tool is often the
 * conversation title, which is derived from the prompt. The host is the only
 * thing the content script may say about where it is.
 */
export interface DecideMessage {
  type: 'AIG_DECIDE';
  host: string;
  classification: Classification;
  detectedCategories: DetectionCategory[];
}

export interface DecideReply {
  result: DecisionResult | null;
  staleness: string | null;
  toolId: string;
}

type Message =
  | DecideMessage
  | AskMessage
  | { type: 'AIG_STATUS' }
  | { type: 'AIG_SET_ACTIVE'; active: boolean }
  | { type: 'AIG_HISTORY' }
  | { type: 'AIG_HISTORY_CLEAR' }
  | { type: 'AIG_SET_IDENTITY'; identityId: string }
  | {
      type: 'AIG_CREATE_REQUEST';
      toolId: string | null;
      toolLabel: string;
      classification: Classification;
      blockingPolicyIds: string[];
      justification: string;
    };

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  void handle(message).then(sendResponse);
  return true;
});

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'AIG_DECIDE':
      return decideFor(message);
    case 'AIG_ASK':
      return askFor(message);
    case 'AIG_SET_ACTIVE':
      await store.set(ACTIVE_KEY, message.active);
      await syncAskMenu();
      return { active: message.active };
    case 'AIG_STATUS':
      return status();
    case 'AIG_HISTORY':
      return { entries: await readHistory(store, new Date()) };
    case 'AIG_HISTORY_CLEAR':
      await clearHistory(store);
      return { cleared: true };
    case 'AIG_SET_IDENTITY':
      await store.set(IDENTITY_KEY, message.identityId);
      await (await sync()).refresh();
      return { identityId: message.identityId };
    case 'AIG_CREATE_REQUEST':
      return createRequest(message);
  }
}

async function status(): Promise<{
  identityId: string;
  staleness: string | null;
  version: string | null;
  active: boolean;
}> {
  const current = await (await sync()).status();
  return {
    identityId: await identityId(),
    active: await readActive(store),
    staleness: describeStaleness(current),
    version: current.snapshot?.policySet.version ?? null,
  };
}

/**
 * The prompt is not a parameter here. Detection happens in the content script's
 * isolated world and only category names cross this boundary, so neither the
 * service worker nor anything downstream of it can hold prompt text.
 */
async function decideFor(message: DecideMessage): Promise<DecideReply> {
  const engine = await sync();
  let current: SyncStatus = await engine.status();
  // Retry while on cache so recovery is noticed at the next decision rather
  // than at the next alarm; a failed attempt is cheap and keeps the flag set.
  if (!current.snapshot || current.stale || current.usingCache) current = await engine.refresh();

  if (!current.snapshot) {
    return { result: null, staleness: describeStaleness(current), toolId: message.host };
  }

  const { policySet, registry, exceptions } = current.snapshot;
  const tool = findToolByHost(registry, message.host);
  const toolId = tool?.id ?? message.host;
  // An unregistered tool is labelled by its hostname. Nothing read from the
  // page itself, title included, is stored anywhere.
  const toolLabel = tool?.name ?? message.host;
  const user = await identityId();

  const result = decide(
    {
      userId: user,
      groups: [],
      pseudonymId: '',
      toolId,
      toolLabel,
      classification: message.classification,
      detectedCategories: message.detectedCategories,
      now: new Date(),
    },
    { policySet, registry, exceptions },
  );

  await appendHistory(store, {
    toolId,
    toolLabel,
    classification: message.classification,
    detectedCategories: message.detectedCategories,
    result,
    policySetVersion: policySet.version,
    at: new Date(),
  });

  void reportAuditEvent(user, toolId, message.classification, result, message.detectedCategories);

  return { result, staleness: describeStaleness(current), toolId };
}

/**
 * Best effort and deliberately not awaited by the decision: if the audit log is
 * unreachable the interaction is still governed. Losing an aggregate is a
 * smaller failure than an enforcement point that stops working when a server is
 * down.
 */
async function reportAuditEvent(
  user: string,
  toolId: string,
  classification: Classification,
  result: DecisionResult,
  detectedCategories: DetectionCategory[],
): Promise<void> {
  try {
    await fetch(`${SERVICE_URL}/api/audit-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aig-user': user },
      body: JSON.stringify({
        toolId,
        classification,
        decision: result.decision,
        matchedPolicyIds: result.matchedPolicyIds,
        suppressedPolicyIds: result.suppressedPolicyIds,
        exceptionIds: result.exceptionIds,
        detectedCategories,
        shadowOutcomes: result.shadowOutcomes,
        policySetVersion: result.policySetVersion,
        registryVersion: result.registryVersion,
      }),
    });
  } catch {
    // Intentionally silent: see above.
  }
}

async function createRequest(message: {
  toolId: string | null;
  toolLabel: string;
  classification: Classification;
  blockingPolicyIds: string[];
  justification: string;
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  try {
    const response = await fetch(`${SERVICE_URL}/api/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aig-user': await identityId() },
      body: JSON.stringify({
        toolId: message.toolId,
        toolLabel: message.toolLabel,
        classification: message.classification,
        blockingPolicyIds: message.blockingPolicyIds,
        justification: message.justification,
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const errors = (payload['errors'] as { message: string }[]) ?? [];
      return { ok: false, message: errors.map((entry) => entry.message).join(' ') || 'Request refused.' };
    }
    return { ok: true, id: payload['id'] as string };
  } catch {
    return { ok: false, message: 'The policy service is not reachable, so the request was not raised.' };
  }
}

// ------------------------------------------------------------ ask regula.dot

const ASK_MENU_ID = 'aig-ask';

/**
 * While regula.dot is switched off nothing is checked on Enter, so the
 * right-click menu offers "Ask regula.dot" on any selection instead. The item
 * exists only in that state: while the guard is on, the guard answers.
 */
async function syncAskMenu(): Promise<void> {
  const active = await readActive(store);
  await new Promise<void>((resolve) => chrome.contextMenus.removeAll(() => resolve()));
  if (active) return;
  chrome.contextMenus.create({ id: ASK_MENU_ID, title: 'Ask regula.dot', contexts: ['selection'] }, () => {
    // A duplicate after two quick toggles is harmless; reading lastError clears it.
    void chrome.runtime.lastError;
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // `info.selectionText` is deliberately never read. The service worker learns
  // which tab asked; the script it injects reads the selection in the page.
  if (info.menuItemId !== ASK_MENU_ID || tab?.id === undefined) return;
  void chrome.scripting
    .executeScript({ target: { tabId: tab.id, frameIds: [info.frameId ?? 0] }, files: ['ask.js'] })
    .catch(() => {
      // Pages the browser keeps extensions out of (chrome://, the Web Store).
    });
});

/**
 * The same evaluation as a decision, asked for every tool at once, for a text
 * that has not been typed anywhere. Nothing is appended to history and no
 * audit event is sent: an ask is advice, not an interaction with a tool.
 */
async function askFor(message: AskMessage): Promise<AskReply> {
  const engine = await sync();
  let current: SyncStatus = await engine.status();
  if (!current.snapshot || current.stale || current.usingCache) current = await engine.refresh();
  if (!current.snapshot) return { verdicts: null, staleness: describeStaleness(current) };

  const { policySet, registry, exceptions } = current.snapshot;
  const survey = decideAcrossRegistry(
    {
      userId: await identityId(),
      groups: [],
      pseudonymId: '',
      classification: message.classification,
      detectedCategories: message.detectedCategories,
      now: new Date(),
    },
    { policySet, registry, exceptions },
  );
  const here = findToolByHost(registry, message.host)?.id ?? null;
  return { verdicts: toAskVerdicts(survey, here), staleness: describeStaleness(current) };
}

// ------------------------------------------------------------------ startup

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create('aig-refresh', { periodInMinutes: REFRESH_MINUTES });
  void syncAskMenu();
  void sync()
    .then((engine) => engine.refresh())
    .then((status) =>
      seedDemoHistoryOnce(store, status.snapshot?.policySet.version ?? 'unknown', new Date()),
    );
});

chrome.runtime.onStartup.addListener(() => {
  void syncAskMenu();
  void sync().then((engine) => engine.refresh());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'aig-refresh') return;
  void sync().then((engine) => engine.refresh());
});
