/**
 * Scripted demo sequence matching the cockpit's story (PRD "Demo fallback"):
 * Mira asks, CH-ACC-01 masks the account number, she requests it, Jonas approves for 30 days,
 * the draft is signed off.
 *
 * Only labels, rule ids, approver names and deep links. No values.
 */
import type { FeedEvent, Snapshot } from "./types";

export type MockStep = {
  /** Delay in ms before this step, relative to the previous step. */
  after: number;
  /** Human-readable step name for the demo hint. */
  name: string;
  /** Build the events for this step at emit time (fresh ids and times). */
  events: (ctx: { cockpit: string; now: Date; seq: () => string }) => FeedEvent[];
};

export function mockSnapshot(cockpit: string): Snapshot {
  return {
    role: "advisor",
    counters: { open: 3, protected: 5, waiting: 0, granted: 1 },
    pending: [],
    drafts: [],
    approverQueue: [],
  };
  void cockpit;
}

const inDays = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

export const mockScript: MockStep[] = [
  {
    after: 4_000,
    name: "Mira asks the assistant",
    events: ({ now, seq, cockpit }) => [
      { id: seq(), time: now.toISOString(), kind: "assistant.working", deepLink: `${cockpit}/assistant?conv=c-1042` },
    ],
  },
  {
    after: 4_000,
    name: "CH-ACC-01 masks the account number",
    events: ({ now, seq, cockpit }) => [
      { id: seq(), time: now.toISOString(), kind: "assistant.done" },
      {
        id: seq(),
        time: now.toISOString(),
        kind: "protection.fired",
        ruleId: "CH-ACC-01",
        label: "account number",
        deepLink: `${cockpit}/assistant?conv=c-1042`,
      },
    ],
  },
  {
    after: 8_000,
    name: "Mira requests the IBAN from Jonas",
    events: ({ now, seq, cockpit }) => [
      {
        id: seq(),
        time: now.toISOString(),
        kind: "request.sent",
        requestId: "r-7731",
        label: "Account number (IBAN)",
        ruleId: "CH-ACC-01",
        approver: "Jonas Frei",
        deepLink: `${cockpit}/access?item=iban`,
      },
      { id: seq(), time: now.toISOString(), kind: "counters.changed", counters: { open: 3, protected: 4, waiting: 1, granted: 1 } },
    ],
  },
  {
    after: 12_000,
    name: "Jonas approves for 30 days",
    events: ({ now, seq, cockpit }) => [
      {
        id: seq(),
        time: now.toISOString(),
        kind: "request.granted",
        requestId: "r-7731",
        label: "Account number (IBAN)",
        until: inDays(now, 30),
        deepLink: `${cockpit}/access?item=iban`,
      },
      { id: seq(), time: now.toISOString(), kind: "counters.changed", counters: { open: 3, protected: 4, waiting: 0, granted: 2 } },
    ],
  },
  {
    after: 10_000,
    name: "A draft needs sign-off",
    events: ({ now, seq, cockpit }) => [
      {
        id: seq(),
        time: now.toISOString(),
        kind: "draft.signoff_needed",
        draftId: "d-311",
        label: "Client letter, Keller",
        deepLink: `${cockpit}/assistant?conv=c-1042#draft`,
      },
    ],
  },
  {
    after: 10_000,
    name: "Reviewer signs the draft",
    events: ({ now, seq }) => [{ id: seq(), time: now.toISOString(), kind: "draft.signed", draftId: "d-311" }],
  },
  {
    after: 8_000,
    name: "Luca's set request is declined",
    events: ({ now, seq, cockpit }) => [
      {
        id: seq(),
        time: now.toISOString(),
        kind: "request.sent",
        requestId: "r-7740",
        label: "Identity items",
        ruleId: "CH-ID-02",
        approver: "Jonas Frei",
        deepLink: `${cockpit}/access#requests`,
        items: 3,
      },
    ],
  },
  {
    after: 8_000,
    name: "Jonas declines with a note",
    events: ({ now, seq, cockpit }) => [
      {
        id: seq(),
        time: now.toISOString(),
        kind: "request.declined",
        requestId: "r-7740",
        label: "Identity items",
        approver: "Jonas Frei",
        deepLink: `${cockpit}/access#requests`,
      },
    ],
  },
];
