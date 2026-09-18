import type { LocalHistoryEntry } from '../core/model.ts';
import type { KeyValueStore } from './storage.ts';
import { HISTORY_KEY } from './history.ts';

const SEEDED_KEY = 'aig.history.seeded';

interface Shape {
  toolId: string;
  toolLabel: string;
  classification: LocalHistoryEntry['classification'];
  decision: LocalHistoryEntry['decision'];
  policyIds: string[];
  detectedCategories: LocalHistoryEntry['detectedCategories'];
  weight: number;
}

/**
 * Demo history for a device that has not been used yet. These are decision
 * records, not invented prompts: there is no content to fabricate here, because
 * the real store never holds any either. That is the point the screen is making.
 */
const SHAPES: Shape[] = [
  { toolId: 'm365-copilot', toolLabel: 'Microsoft 365 Copilot', classification: 'INTERNAL', decision: 'ALLOW', policyIds: [], detectedCategories: [], weight: 30 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'INTERNAL', decision: 'ALLOW', policyIds: [], detectedCategories: [], weight: 22 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'CONFIDENTIAL', decision: 'MAKE_SAFE', policyIds: ['CH-AI-PII-01'], detectedCategories: ['PERSON_NAME', 'EMAIL'], weight: 12 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'CONFIDENTIAL', decision: 'MAKE_SAFE', policyIds: ['CH-AI-PII-01'], detectedCategories: ['IBAN'], weight: 6 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'CONFIDENTIAL', decision: 'BLOCK', policyIds: ['CH-AI-CONF-01'], detectedCategories: [], weight: 8 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'CONFIDENTIAL', decision: 'BLOCK', policyIds: ['CH-AI-PII-02'], detectedCategories: ['SPECIAL_CATEGORY'], weight: 3 },
  { toolId: 'chatgpt', toolLabel: 'ChatGPT Enterprise', classification: 'INTERNAL', decision: 'BLOCK', policyIds: ['CH-AI-CRED-01'], detectedCategories: ['CREDENTIAL'], weight: 2 },
  { toolId: 'm365-copilot', toolLabel: 'Microsoft 365 Copilot', classification: 'CONFIDENTIAL', decision: 'ALLOW', policyIds: [], detectedCategories: [], weight: 10 },
  { toolId: 'gemini', toolLabel: 'Google Gemini (consumer)', classification: 'INTERNAL', decision: 'BLOCK', policyIds: ['CH-AI-TOOL-01'], detectedCategories: [], weight: 4 },
];

export function demoHistory(now: Date, policySetVersion: string, count = 38): LocalHistoryEntry[] {
  const pool = SHAPES.flatMap((shape) => Array.from({ length: shape.weight }, () => shape));
  const entries: LocalHistoryEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const shape = pool[Math.floor(Math.random() * pool.length)];
    if (!shape) continue;
    // Spread over working hours across the last three weeks.
    const daysAgo = Math.floor(Math.random() * 20);
    const at = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    at.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);

    entries.push({
      id: `lh-seed-${index}`,
      at: at.toISOString(),
      toolId: shape.toolId,
      toolLabel: shape.toolLabel,
      classification: shape.classification,
      decision: shape.decision,
      policyIds: [...shape.policyIds],
      suppressedPolicyIds: [],
      detectedCategories: [...shape.detectedCategories],
      policySetVersion,
    });
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Runs once per install and never again — including after the user clears their
 * history. Repopulating a store somebody deliberately emptied would be the
 * opposite of what the clear button promises.
 */
export async function seedDemoHistoryOnce(
  store: KeyValueStore,
  policySetVersion: string,
  now: Date,
): Promise<boolean> {
  if ((await store.get<boolean>(SEEDED_KEY)) === true) return false;
  await store.set(SEEDED_KEY, true);
  await store.set(HISTORY_KEY, demoHistory(now, policySetVersion));
  return true;
}
