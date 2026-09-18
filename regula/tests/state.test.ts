/**
 * Replays Mira's story through the state machine and checks the pose after
 * every step, including the timers. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { derivePose, initialModel, reduce, badgeRuleId, trayCount, TIMEOUTS_MS, type Model } from "../src/state";
import { mockScript, mockSnapshot } from "../src/mock-script";
import { setLang, t } from "../src/strings";

let now = Date.parse("2026-09-18T10:00:00Z");
let m: Model = initialModel();
let seq = 0;
const cockpit = "https://cockpit.example";
const step = (name: string) => {
  const s = mockScript.find((x) => x.name === name)!;
  for (const e of s.events({ cockpit, now: new Date(now), seq: () => `e${++seq}` })) m = reduce(m, { type: "event", event: e }, now);
};
const pose = () => derivePose(m, now);
const advance = (ms: number) => {
  now += ms;
  m = reduce(m, { type: "tick", now }, now);
};
const bubbleText = () => (m.bubble ? t(m.bubble.key, m.bubble.params) : null);
setLang("en");

assert.equal(pose(), "offline", "starts offline until the feed connects");
m = reduce(m, { type: "snapshot", snapshot: mockSnapshot(cockpit) }, now);
m = reduce(m, { type: "connected" }, now);
assert.equal(pose(), "idle");
assert.deepEqual(m.counters, { open: 2, protected: 1, waiting: 0, granted: 1 });

step("Mira asks the assistant");
assert.equal(pose(), "working");
assert.equal(bubbleText(), "Thinking with the assistant.");

step("CH-ID-01 protects the identifier");
assert.equal(pose(), "protected");
assert.equal(badgeRuleId(m, pose()), "CH-ID-01");
assert.equal(bubbleText(), "CH-ID-01 kept the identifier masked.");
assert.equal(m.counters.protected, 2);
advance(TIMEOUTS_MS.protected + 1);
assert.equal(pose(), "idle", "Protected → Idle once the bubble is gone");
assert.equal(m.bubble, null);

step("Mira requests the IBAN from Jonas");
assert.equal(pose(), "pending");
assert.equal(badgeRuleId(m, pose()), "CH-ACC-01");
assert.equal(bubbleText(), "Jonas has your Account number (IBAN) request.");
assert.equal(m.counters.waiting, 1);
assert.equal(trayCount(m), 1, "the menu-bar dot shows one item waiting");
advance(60_000);
assert.equal(pose(), "pending", "Pending persists as long as the cockpit says so");

step("Jonas approves for 30 days");
assert.equal(pose(), "granted");
assert.match(bubbleText()!, /^Granted until .+\. Nice\.$/);
assert.equal(m.pending.length, 0);
assert.equal(trayCount(m), 0);
advance(TIMEOUTS_MS.granted + 1);
assert.equal(pose(), "idle", "Granted → Idle after 8 s");

step("A draft needs sign-off");
assert.equal(pose(), "signoff");
assert.equal(bubbleText(), "One draft wants a reviewer.");
step("Reviewer signs the draft");
advance(TIMEOUTS_MS.bubble + 1);
assert.equal(pose(), "idle");

step("Luca's set request is declined");
assert.equal(pose(), "pending");
assert.equal(m.pending[0].items, 3, "set request shows as one item");
step("Jonas declines with a note");
assert.equal(pose(), "declined");
assert.equal(bubbleText(), "Jonas left a note. Open it?");
advance(TIMEOUTS_MS.declined + 1);
assert.equal(pose(), "idle");

// Pause hides bubbles and shows the sleeping pose; offline wins over everything but pause.
m = reduce(m, { type: "pause", seconds: 3600 }, now);
assert.equal(pose(), "paused");
step("Mira asks the assistant");
assert.equal(m.bubble, null, "no bubble while paused");
m = reduce(m, { type: "pause", seconds: 0 }, now);
m = reduce(m, { type: "disconnected" }, now);
assert.equal(pose(), "offline");
assert.equal(bubbleText(), "Cockpit not reachable.");
m = reduce(m, { type: "connected" }, now);
assert.equal(pose(), "idle");

// Duplicate and stale events are ignored.
const before = m;
m = reduce(m, { type: "event", event: { id: "e1", kind: "assistant.working", time: new Date(now).toISOString() } }, now);
assert.equal(m, before, "duplicate id ignored");
m = reduce(m, { type: "event", event: { id: "old", kind: "assistant.working", time: new Date(now - 25 * 3600_000).toISOString() } }, now);
assert.equal(m, before, "event older than 24 h ignored");

// Every string stays under 12 words and never carries an emoji.
for (const lang of ["en", "de"] as const) {
  setLang(lang);
  for (const key of ["working", "protected", "pending", "granted", "declined", "signoff", "signed", "offline", "approverNew"]) {
    const s = t(key, { rule: "CH-ACC-01", label: "Account number (IBAN)", approver: "Jonas", until: "30 Sep", from: "Mira", count: "1" });
    assert.ok(s.split(/\s+/).length <= 12, `${lang}.${key} too long: ${s}`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(s), `${lang}.${key} has an emoji`);
  }
}

console.log("state machine: all checks passed");
