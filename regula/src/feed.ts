/**
 * Feed clients. Both deliver the same thing to the state machine: a snapshot
 * on connect, then events. The mock replays the scripted story; the SSE client
 * talks to the cockpit's `/api/pet/events` and `/api/pet/state`.
 */
import type { FeedEvent, Input, Snapshot } from "./types";
import { mockScript, mockSnapshot } from "./mock-script";

export type Dispatch = (input: Input) => void;

export interface Feed {
  start(): void;
  stop(): void;
  /** Mock only: jump to the next step. */
  next?(): void;
  /** Mock only: restart the story. */
  restart?(): void;
  /** Mock only: simulate losing / regaining the connection. */
  toggleOffline?(): void;
  /** Mock only: name of the upcoming step, for the demo hint. */
  upcoming?(): string | null;
}

// ---------------------------------------------------------------------------
// Mock feed

export class MockFeed implements Feed {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private counter = 0;
  private offline = false;

  constructor(
    private dispatch: Dispatch,
    private cockpit: string,
  ) {}

  start() {
    this.restart();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  restart() {
    this.stop();
    this.index = 0;
    this.offline = false;
    this.dispatch({ type: "snapshot", snapshot: mockSnapshot(this.cockpit) });
    this.dispatch({ type: "connected" });
    this.schedule();
  }

  next() {
    if (this.offline) return;
    this.stop();
    this.emitCurrent();
    this.schedule();
  }

  toggleOffline() {
    this.offline = !this.offline;
    if (this.offline) {
      this.stop();
      this.dispatch({ type: "disconnected" });
    } else {
      this.dispatch({ type: "snapshot", snapshot: mockSnapshot(this.cockpit) });
      this.dispatch({ type: "connected" });
      this.schedule();
    }
  }

  upcoming(): string | null {
    return mockScript[this.index]?.name ?? null;
  }

  private schedule() {
    const step = mockScript[this.index];
    if (!step) {
      // Loop the story after a rest so a demo table never goes stale.
      this.timer = setTimeout(() => this.restart(), 20_000);
      return;
    }
    this.timer = setTimeout(() => {
      this.emitCurrent();
      this.schedule();
    }, step.after);
  }

  private emitCurrent() {
    const step = mockScript[this.index];
    if (!step) return;
    this.index += 1;
    const events = step.events({
      cockpit: this.cockpit,
      now: new Date(),
      seq: () => `mock-${Date.now()}-${++this.counter}`,
    });
    for (const e of events) this.dispatch({ type: "event", event: e });
  }
}

// ---------------------------------------------------------------------------
// SSE feed

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class SseFeed implements Feed {
  private source: EventSource | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lastEventId: string | null = null;

  constructor(
    private dispatch: Dispatch,
    private cockpit: string,
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.source?.close();
    this.source = null;
  }

  private async connect() {
    if (this.stopped) return;
    try {
      const res = await fetch(`${this.cockpit}/api/pet/state`, { credentials: "include" });
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const snapshot = (await res.json()) as Snapshot;
      this.dispatch({ type: "snapshot", snapshot });
    } catch (err) {
      console.warn("[regula] snapshot failed", err);
      this.dispatch({ type: "disconnected" });
      this.retry();
      return;
    }

    const url = new URL(`${this.cockpit}/api/pet/events`);
    if (this.lastEventId) url.searchParams.set("lastEventId", this.lastEventId);
    const es = new EventSource(url.toString(), { withCredentials: true });
    this.source = es;

    es.onopen = () => {
      this.attempt = 0;
      this.dispatch({ type: "connected" });
    };
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as FeedEvent;
        if (msg.lastEventId) this.lastEventId = msg.lastEventId;
        else if (event.id) this.lastEventId = event.id;
        this.dispatch({ type: "event", event });
      } catch (err) {
        console.warn("[regula] bad event", err);
      }
    };
    es.onerror = () => {
      es.close();
      this.source = null;
      this.dispatch({ type: "disconnected" });
      this.retry();
    };
  }

  private retry() {
    if (this.stopped) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }
}
