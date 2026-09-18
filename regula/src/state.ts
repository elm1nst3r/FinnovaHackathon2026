/**
 * Regula's state machine.
 *
 * The model is derived purely from the latest snapshot plus the events since,
 * so a replay always ends in the right state. The visible pose is computed
 * from the model on every tick: persistent facts (pending, sign-off, offline,
 * paused) win over idle, and short celebratory poses (protected, granted,
 * declined, working) sit on top until the next event or a timer clears them.
 */
import type { Counters, Draft, FeedEvent, Input, PendingRequest, Pose, Role, Snapshot, ApproverRequest } from "./types";

export const TIMEOUTS_MS = {
  protected: 6_000, // Protected → Idle when the bubble is dismissed (auto-hide after 6 s)
  granted: 8_000,
  declined: 8_000,
  bubble: 6_000,
  workingMax: 120_000, // safety net if assistant.done never arrives
  maxEventAge: 24 * 60 * 60 * 1000,
} as const;

export type Transient = {
  pose: "working" | "protected" | "granted" | "declined";
  until: number;
  ruleId?: string;
  label?: string;
};

export type Bubble = {
  key: string; // strings key
  params: Record<string, string>;
  until: number;
  deepLink?: string;
};

export type Model = {
  role: Role;
  connected: boolean;
  hasSnapshot: boolean;
  counters: Counters;
  pending: PendingRequest[];
  drafts: Draft[];
  approverQueue: ApproverRequest[];
  transient: Transient | null;
  bubble: Bubble | null;
  pausedUntil: number; // epoch ms, 0 = not paused
  lastRuleId: string | null;
  lastEvent: { kind: string; time: string } | null;
  lastEventId: string | null;
  disabled: boolean;
  seen: Set<string>;
};

export function initialModel(): Model {
  return {
    role: "advisor",
    connected: false,
    hasSnapshot: false,
    counters: { open: 0, protected: 0, waiting: 0, granted: 0 },
    pending: [],
    drafts: [],
    approverQueue: [],
    transient: null,
    bubble: null,
    pausedUntil: 0,
    lastRuleId: null,
    lastEvent: null,
    lastEventId: null,
    disabled: false,
    seen: new Set(),
  };
}

export function derivePose(m: Model, now: number): Pose {
  if (m.pausedUntil > now) return "paused";
  if (!m.connected) return "offline";
  if (m.transient && m.transient.until > now) return m.transient.pose;
  if (m.pending.length > 0) return "pending";
  if (m.drafts.length > 0) return "signoff";
  return "idle";
}

function bubble(m: Model, key: string, params: Record<string, string>, now: number, deepLink?: string): Bubble | null {
  if (m.pausedUntil > now) return null;
  return { key, params, until: now + TIMEOUTS_MS.bubble, deepLink };
}

function applySnapshot(m: Model, s: Snapshot): Model {
  return {
    ...m,
    hasSnapshot: true,
    role: s.role,
    counters: { ...s.counters },
    pending: [...s.pending],
    drafts: [...s.drafts],
    approverQueue: [...(s.approverQueue ?? [])],
  };
}

function firstName(display: string): string {
  return display.trim().split(/\s+/)[0] ?? display;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function applyEvent(m: Model, e: FeedEvent, now: number): Model {
  const eventTime = Date.parse(e.time);
  if (!Number.isNaN(eventTime) && now - eventTime > TIMEOUTS_MS.maxEventAge) return m; // stale, ignore
  if (m.seen.has(e.id)) return m;
  const seen = new Set(m.seen);
  seen.add(e.id);

  // Every story event ends the current transient pose (the event itself may set
  // a new one). Bookkeeping events, counters and the approver queue, leave it alone.
  const bookkeeping = e.kind === "counters.changed" || e.kind === "approver.request_received";
  let next: Model = {
    ...m,
    seen,
    transient: bookkeeping ? m.transient : null,
    lastEvent: { kind: e.kind, time: e.time },
    lastEventId: e.id,
  };

  switch (e.kind) {
    case "assistant.working":
      next.transient = { pose: "working", until: now + TIMEOUTS_MS.workingMax };
      next.bubble = bubble(next, "working", {}, now);
      break;
    case "assistant.done":
      next.bubble = null;
      break;
    case "protection.fired":
      next.transient = { pose: "protected", until: now + TIMEOUTS_MS.protected, ruleId: e.ruleId, label: e.label };
      next.lastRuleId = e.ruleId;
      next.bubble = bubble(next, "protected", { rule: e.ruleId, label: e.label }, now, e.deepLink);
      break;
    case "request.sent":
      next.pending = [
        ...next.pending.filter((p) => p.requestId !== e.requestId),
        {
          requestId: e.requestId,
          label: e.label,
          ruleId: e.ruleId,
          approver: e.approver,
          deepLink: e.deepLink,
          sentAt: e.time,
          items: e.items,
        },
      ];
      next.lastRuleId = e.ruleId;
      next.bubble = bubble(next, "pending", { approver: firstName(e.approver), label: e.label }, now, e.deepLink);
      break;
    case "request.granted":
      next.pending = next.pending.filter((p) => p.requestId !== e.requestId);
      next.transient = { pose: "granted", until: now + TIMEOUTS_MS.granted, label: e.label };
      next.bubble = bubble(next, "granted", { until: shortDate(e.until), label: e.label }, now, e.deepLink);
      break;
    case "request.declined":
      next.pending = next.pending.filter((p) => p.requestId !== e.requestId);
      next.transient = { pose: "declined", until: now + TIMEOUTS_MS.declined, label: e.label };
      next.bubble = bubble(next, "declined", { approver: firstName(e.approver), label: e.label }, now, e.deepLink);
      break;
    case "draft.signoff_needed":
      next.drafts = [
        ...next.drafts.filter((d) => d.draftId !== e.draftId),
        { draftId: e.draftId, label: e.label, deepLink: e.deepLink },
      ];
      next.bubble = bubble(next, "signoff", { label: e.label }, now, e.deepLink);
      break;
    case "draft.signed":
      next.drafts = next.drafts.filter((d) => d.draftId !== e.draftId);
      next.bubble = bubble(next, "signed", {}, now);
      break;
    case "counters.changed":
      next.counters = { ...e.counters };
      break;
    case "approver.request_received":
      next.approverQueue = [
        { requestId: e.requestId, label: e.label, ruleId: e.ruleId, from: e.from, deepLink: e.deepLink },
        ...next.approverQueue.filter((r) => r.requestId !== e.requestId),
      ];
      next.bubble = bubble(
        next,
        "approverNew",
        { from: firstName(e.from), label: e.label, count: String(next.approverQueue.length) },
        now,
        e.deepLink,
      );
      break;
    case "pet.disable":
      next.disabled = true;
      next.bubble = null;
      break;
  }
  return next;
}

export function reduce(m: Model, input: Input, now: number = Date.now()): Model {
  switch (input.type) {
    case "snapshot":
      return applySnapshot(m, input.snapshot);
    case "event":
      return applyEvent(m, input.event, now);
    case "connected":
      return m.connected ? m : { ...m, connected: true, bubble: null };
    case "disconnected":
      return m.connected
        ? { ...m, connected: false, transient: null, bubble: bubble(m, "offline", {}, now) }
        : m;
    case "pause": {
      const pausedUntil = input.seconds > 0 ? now + input.seconds * 1000 : 0;
      return { ...m, pausedUntil, bubble: pausedUntil ? null : m.bubble };
    }
    case "dismiss-bubble": {
      // Dismissing the Protected bubble also ends the Protected pose (PRD state chart).
      const transient = m.transient?.pose === "protected" ? null : m.transient;
      return { ...m, bubble: null, transient };
    }
    case "tick": {
      let next = m;
      if (next.bubble && next.bubble.until <= input.now) next = { ...next, bubble: null };
      if (next.transient && next.transient.until <= input.now) next = { ...next, transient: null };
      if (next.pausedUntil && next.pausedUntil <= input.now) next = { ...next, pausedUntil: 0 };
      return next;
    }
  }
}

/** Rule id shown on the shield badge, if any is relevant for the current pose. */
export function badgeRuleId(m: Model, pose: Pose): string | null {
  if (pose === "protected") return m.transient?.ruleId ?? m.lastRuleId;
  if (pose === "pending") return m.pending[m.pending.length - 1]?.ruleId ?? null;
  return null;
}

/** Items waiting on the user, shown as a number next to the menu-bar dot. */
export function trayCount(m: Model): number {
  return m.pending.length + m.drafts.length + (m.role === "approver" ? m.approverQueue.length : 0);
}
