/**
 * Wire types for the cockpit pet feed (PRD "Cockpit integration contract").
 *
 * Deliberately narrow: an event carries an id, a kind, a time, an item label,
 * a rule id, an approver display name, a deep link, and for counters the four
 * integers. There is no field for a value, a client name, or conversation
 * text, and Regula has nowhere to put one.
 */

export type Counters = {
  open: number;
  protected: number;
  waiting: number;
  granted: number;
};

export type PendingRequest = {
  requestId: string;
  label: string;
  ruleId: string;
  approver: string;
  deepLink: string;
  sentAt: string;
  /** Number of items when this is a set request (shown as one item). */
  items?: number;
};

export type Draft = {
  draftId: string;
  label: string;
  deepLink: string;
};

export type ApproverRequest = {
  requestId: string;
  label: string;
  ruleId: string;
  from: string;
  deepLink: string;
};

export type Role = "advisor" | "approver";

export type Snapshot = {
  role: Role;
  counters: Counters;
  pending: PendingRequest[];
  drafts: Draft[];
  approverQueue?: ApproverRequest[];
};

type Base = { id: string; time: string };

export type FeedEvent =
  | (Base & { kind: "assistant.working"; deepLink?: string })
  | (Base & { kind: "assistant.done" })
  | (Base & { kind: "protection.fired"; ruleId: string; label: string; deepLink: string })
  | (Base & {
      kind: "request.sent";
      requestId: string;
      label: string;
      ruleId: string;
      approver: string;
      deepLink: string;
      items?: number;
    })
  | (Base & { kind: "request.granted"; requestId: string; label: string; until: string; deepLink: string })
  | (Base & { kind: "request.declined"; requestId: string; label: string; approver: string; deepLink: string })
  | (Base & { kind: "draft.signoff_needed"; draftId: string; label: string; deepLink: string })
  | (Base & { kind: "draft.signed"; draftId: string })
  | (Base & { kind: "counters.changed"; counters: Counters })
  | (Base & {
      kind: "approver.request_received";
      requestId: string;
      label: string;
      ruleId: string;
      from: string;
      deepLink: string;
    })
  | (Base & { kind: "pet.disable" });

export type EventKind = FeedEvent["kind"];

/** Everything that can be sent to the state machine. */
export type Input =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "event"; event: FeedEvent }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "pause"; seconds: number }
  | { type: "dismiss-bubble" }
  | { type: "tick"; now: number };

export type Pose =
  | "idle"
  | "working"
  | "protected"
  | "pending"
  | "granted"
  | "declined"
  | "signoff"
  | "offline"
  | "paused";
