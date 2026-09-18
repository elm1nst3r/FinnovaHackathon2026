import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicySync, STALE_AFTER_HOURS, describeStaleness } from '../src/extension/sync.ts';
import { memoryStore } from '../src/extension/storage.ts';
import { appendHistory, clearHistory, prune, readHistory, HISTORY_KEY, MAX_ENTRIES } from '../src/extension/history.ts';
import { seedDemoHistoryOnce } from '../src/extension/demo-history.ts';
import { detect, raiseClassification, sanitise } from '../src/extension/detect.ts';
import { decide, decideAcrossRegistry, findToolByHost } from '../src/core/engine.ts';
import { toAskVerdicts } from '../src/extension/ask-verdict.ts';
import { SEED_POLICY_SET, SEED_REGISTRY } from '../src/fixtures/seed.ts';
import type { LocalHistoryEntry } from '../src/core/model.ts';

const PROMPT =
  'Herr Max Muster hat eine Frage zu seinem Konto CH93 0076 2011 6238 5295 7, ' +
  'erreichbar unter max.muster@example.ch oder 079 123 45 67. api_key: sk-abcdef0123456789abcdef.';

// ------------------------------------------------------------------ detection

test('detection finds the categories a Swiss bank actually leaks', () => {
  const result = detect(PROMPT);
  assert.deepEqual(
    [...result.categories].sort(),
    ['CREDENTIAL', 'EMAIL', 'IBAN', 'PERSON_NAME', 'PHONE'].sort(),
  );
});

test('detection raises a classification the user set too low, and never lowers one', () => {
  assert.equal(raiseClassification('INTERNAL', ['IBAN']), 'CONFIDENTIAL');
  assert.equal(raiseClassification('INTERNAL', ['SPECIAL_CATEGORY']), 'STRICTLY_CONFIDENTIAL');
  assert.equal(raiseClassification('STRICTLY_CONFIDENTIAL', []), 'STRICTLY_CONFIDENTIAL');
  assert.equal(raiseClassification('CONFIDENTIAL', ['EMAIL']), 'CONFIDENTIAL');
});

test('sanitisation replaces what the decision named and leaves the rest alone', () => {
  const detection = detect(PROMPT);
  const result = sanitise(PROMPT, detection, ['PERSON_NAME', 'EMAIL', 'PHONE', 'IBAN']);

  assert.ok(!result.text.includes('CH93 0076 2011 6238 5295 7'));
  assert.ok(!result.text.includes('max.muster@example.ch'));
  assert.ok(result.text.includes('[IBAN]'));
  // The credential was not in the list, so it is still there: a credential is
  // not something to quietly redact and send anyway.
  assert.ok(result.text.includes('sk-abcdef0123456789abcdef'));
});

test('a credential is never silently redacted, even if asked for', () => {
  const detection = detect('password: hunter2');
  const result = sanitise('password: hunter2', detection, ['CREDENTIAL']);
  assert.equal(result.text, 'password: hunter2');
  assert.deepEqual(result.replacements, []);
});

// -------------------------------------------------------------------- history

function decisionFor(categories: Parameters<typeof raiseClassification>[1]) {
  return decide(
    {
      userId: 'u-anna',
      groups: [],
      pseudonymId: '',
      toolId: 'chatgpt',
      toolLabel: 'ChatGPT Enterprise',
      classification: 'CONFIDENTIAL',
      detectedCategories: [...categories],
      now: new Date(),
    },
    { policySet: SEED_POLICY_SET, registry: SEED_REGISTRY, exceptions: [] },
  );
}

test('the local history holds no prompt content', async () => {
  const store = memoryStore();
  const detection = detect(PROMPT);

  await appendHistory(store, {
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    detectedCategories: detection.categories,
    result: decisionFor(detection.categories),
    policySetVersion: SEED_POLICY_SET.version,
    at: new Date(),
  });

  const serialised = JSON.stringify(await readHistory(store, new Date()));
  for (const fragment of ['Max Muster', 'CH93', 'max.muster@example.ch', '079 123', 'sk-abcdef', 'Konto']) {
    assert.ok(!serialised.includes(fragment), `"${fragment}" must not reach the local store`);
  }
  // What it does hold is the category name, which is what makes the entry
  // explicable without being a copy of the prompt.
  assert.ok(serialised.includes('IBAN'));
});

test('history ages out and is capped', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  const entry = (at: string, id: string): LocalHistoryEntry => ({
    id,
    at,
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'INTERNAL',
    decision: 'ALLOW',
    policyIds: [],
    suppressedPolicyIds: [],
    detectedCategories: [],
    policySetVersion: 'ps-2026.1',
  });

  const old = entry('2026-01-01T12:00:00Z', 'old');
  const recent = Array.from({ length: MAX_ENTRIES + 25 }, (_value, index) =>
    entry(new Date(now.getTime() - index * 60_000).toISOString(), `r-${index}`),
  );

  const pruned = prune([old, ...recent], now);
  assert.equal(pruned.length, MAX_ENTRIES);
  assert.ok(!pruned.some((candidate) => candidate.id === 'old'));
});

test('clearing history leaves nothing behind, not even a note that it happened', async () => {
  const store = memoryStore();
  await appendHistory(store, {
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'INTERNAL',
    detectedCategories: [],
    result: decisionFor([]),
    policySetVersion: SEED_POLICY_SET.version,
    at: new Date(),
  });

  await clearHistory(store);
  assert.deepEqual(await readHistory(store, new Date()), []);
});

test('demo history is seeded once and never restored behind the user back', async () => {
  const store = memoryStore();
  const now = new Date();

  assert.equal(await seedDemoHistoryOnce(store, SEED_POLICY_SET.version, now), true);
  const seeded = await readHistory(store, now);
  assert.ok(seeded.length > 0);
  assert.ok(!JSON.stringify(seeded).includes('prompt'), 'seeded entries are decisions, not content');

  await clearHistory(store);
  assert.equal(await seedDemoHistoryOnce(store, SEED_POLICY_SET.version, now), false);
  assert.deepEqual(await readHistory(store, now), [], 'a cleared history stays cleared');
});

// ----------------------------------------------------------------- resilience

function fakeFetch(responses: Record<string, unknown>, fail = false): typeof fetch {
  return (async (input: string) => {
    if (fail) throw new Error('network down');
    const path = new URL(input).pathname;
    return {
      ok: true,
      status: 200,
      json: async () => responses[path],
    } as Response;
  }) as unknown as typeof fetch;
}

const RESPONSES = {
  '/api/policy-set': SEED_POLICY_SET,
  '/api/registry': SEED_REGISTRY,
  '/api/my/exceptions': { exceptions: [] },
};

test('a fetched policy set is cached and used when the service goes away', async () => {
  const store = memoryStore();

  const online = new PolicySync(store, {
    baseUrl: 'http://127.0.0.1:8787',
    identityId: 'u-anna',
    fetchImpl: fakeFetch(RESPONSES),
  });
  const first = await online.refresh();
  assert.equal(first.snapshot?.policySet.version, SEED_POLICY_SET.version);
  assert.equal(first.usingCache, false);
  assert.equal(describeStaleness(first), null);

  const offline = new PolicySync(store, {
    baseUrl: 'http://127.0.0.1:8787',
    identityId: 'u-anna',
    fetchImpl: fakeFetch(RESPONSES, true),
  });
  const second = await offline.refresh();

  assert.equal(second.snapshot?.policySet.version, SEED_POLICY_SET.version, 'enforcement continues');
  assert.equal(second.usingCache, true);
  assert.match(describeStaleness(second) ?? '', /not reachable/);
});

test('an unreachable service with no cache enforces nothing and says so', async () => {
  const sync = new PolicySync(memoryStore(), {
    baseUrl: 'http://127.0.0.1:8787',
    identityId: 'u-anna',
    fetchImpl: fakeFetch(RESPONSES, true),
  });

  const status = await sync.refresh();
  assert.equal(status.snapshot, null);
  assert.match(describeStaleness(status) ?? '', /No policy set has been fetched/);
});

test('a cache older than the staleness window is still used, but flagged', async () => {
  const store = memoryStore();
  const fetchedAt = new Date('2026-03-01T00:00:00Z');
  const later = new Date(fetchedAt.getTime() + (STALE_AFTER_HOURS + 2) * 3_600_000);

  await new PolicySync(store, {
    baseUrl: 'http://127.0.0.1:8787',
    identityId: 'u-anna',
    fetchImpl: fakeFetch(RESPONSES),
    now: () => fetchedAt,
  }).refresh();

  const status = await new PolicySync(store, {
    baseUrl: 'http://127.0.0.1:8787',
    identityId: 'u-anna',
    fetchImpl: fakeFetch(RESPONSES, true),
    now: () => later,
  }).refresh();

  assert.equal(status.stale, true);
  assert.equal(status.snapshot?.policySet.version, SEED_POLICY_SET.version);
});

test('an outage is remembered across service worker restarts, not only in memory', async () => {
  const store = memoryStore();
  const options = { baseUrl: 'http://127.0.0.1:8787', identityId: 'u-anna' };
  await new PolicySync(store, { ...options, fetchImpl: fakeFetch(RESPONSES) }).refresh();
  await new PolicySync(store, { ...options, fetchImpl: fakeFetch(RESPONSES, true) }).refresh();

  // A fresh instance, as a restarted worker creates for every message, must
  // still know that the last fetch failed — otherwise the user is never told.
  const status = await new PolicySync(store, { ...options, fetchImpl: fakeFetch(RESPONSES, true) }).status();
  assert.equal(status.usingCache, true);
  assert.match(describeStaleness(status) ?? '', /not reachable/);

  await new PolicySync(store, { ...options, fetchImpl: fakeFetch(RESPONSES) }).refresh();
  const recovered = await new PolicySync(store, { ...options, fetchImpl: fakeFetch(RESPONSES) }).status();
  assert.equal(recovered.usingCache, false);
  assert.equal(describeStaleness(recovered), null);
});

test('reading history removes aged-out entries from the device, not only from the view', async () => {
  const now = new Date('2026-03-01T12:00:00Z');
  const entry = (at: string, id: string): LocalHistoryEntry => ({
    id,
    at,
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'INTERNAL',
    decision: 'ALLOW',
    policyIds: [],
    suppressedPolicyIds: [],
    detectedCategories: [],
    policySetVersion: 'ps-2026.1',
  });
  const store = memoryStore({ [HISTORY_KEY]: [entry('2026-01-01T12:00:00Z', 'old'), entry(now.toISOString(), 'new')] });

  const shown = await readHistory(store, now);
  assert.deepEqual(shown.map((candidate) => candidate.id), ['new']);
  const onDisk = await store.get<LocalHistoryEntry[]>(HISTORY_KEY);
  assert.deepEqual(onDisk?.map((candidate) => candidate.id), ['new']);
});

// ---------------------------------------------------------------- ask regula.dot

test('an ask names the tool of the page it came from and carries no text', () => {
  const detection = detect(PROMPT);
  const survey = decideAcrossRegistry(
    {
      userId: 'u-anna',
      groups: [],
      pseudonymId: '',
      classification: raiseClassification('INTERNAL', detection.categories),
      detectedCategories: detection.categories,
      now: new Date(),
    },
    { policySet: SEED_POLICY_SET, registry: SEED_REGISTRY, exceptions: [] },
  );
  const verdicts = toAskVerdicts(survey, findToolByHost(SEED_REGISTRY, 'chat.openai.com')?.id ?? null);

  assert.equal(verdicts.length, SEED_REGISTRY.tools.length);
  assert.deepEqual(verdicts.filter((verdict) => verdict.here).map((verdict) => verdict.toolId), ['chatgpt']);
  // The credential blocks everywhere, and every verdict says why.
  assert.ok(verdicts.every((verdict) => verdict.decision === 'BLOCK'));
  assert.ok(verdicts.every((verdict) => verdict.reasons.some((reason) => reason.policyId === 'CH-AI-CRED-01')));

  // Field by field, nothing from the selection can be in the reply.
  const serialised = JSON.stringify(verdicts);
  for (const value of ['Max Muster', 'CH93 0076', 'max.muster@example.ch', 'sk-abcdef', '079 123']) {
    assert.ok(!serialised.includes(value), `reply leaks ${value}`);
  }
  const first = verdicts[0];
  assert.ok(first);
  assert.deepEqual(
    Object.keys(first).sort(),
    ['approved', 'decision', 'here', 'hostingRegion', 'reasons', 'sanitiseCategories', 'suppressedPolicyIds', 'toolId', 'toolName'],
  );
});
