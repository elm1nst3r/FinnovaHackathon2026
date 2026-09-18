/**
 * What the menu-bar dropdown shows: a status line, the cockpit totals, the
 * last thing Regula said (with its time), the items waiting in two groups
 * ("Needs you", "With the approver"), the link to the details in the cockpit,
 * and the labels of the fixed actions below (so every word, including the
 * settings, is localised here). Pure: model in, strings out. The Rust shell
 * renders it as native menu items and opens the links; nothing here navigates.
 */
import { shortTime, trayCount, type Model } from "./state";
import type { Pose } from "./types";
import { t } from "./strings";

export type TrayLink = { text: string; url: string | null };

export type TrayGroup = { title: string; items: TrayLink[] };

/** Labels of the fixed actions under the summary; the shell owns their behaviour. */
export type TrayActions = {
  openCockpit: string;
  pause: string;
  pauseTomorrow: string;
  resume: string;
  /** Check item: the desktop companion on or off (the dot stays in the menu bar). */
  desktop: string;
  /** Check item: the cursor falls through the companion. */
  clickThrough: string;
  /** Everything else is managed online in the cockpit. */
  settings: TrayLink;
  help: TrayLink;
  quit: string;
};

export type TrayInfo = {
  /** Also the tooltip of the menu-bar dot. */
  status: string;
  counters: string;
  /** The last thing Regula said and when, clickable when it had a deep link. */
  note: TrayLink | null;
  /** Items waiting, grouped; each opens its cockpit deep link. */
  groups: TrayGroup[];
  details: TrayLink;
  /** True while reactions are paused; the shell shows Resume instead of the Pause entries. */
  paused: boolean;
  actions: TrayActions;
};

export type TrayContext = {
  now?: number;
  /** The companion lets clicks fall through; said in the status so the user knows why it ignores them. */
  clickThrough?: boolean;
};

/** Menus grow tall quickly; the cockpit shows the rest. */
const MAX_ITEMS = 8;

/** "2 min", "3 h", "2 d": how long an item has been waiting. */
export function age(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 60_000) return t("ageNow");
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t("ageMin", { n: String(min) });
  const h = Math.floor(min / 60);
  if (h < 24) return t("ageHours", { n: String(h) });
  return t("ageDays", { n: String(Math.floor(h / 24)) });
}

function pausedStatus(m: Model, now: number): string {
  const left = Math.max(0, m.pausedUntil - now);
  const min = Math.ceil(left / 60_000);
  if (min >= 120) return t("status_pausedHours", { n: String(Math.round(min / 60)) });
  if (min > 0) return t("status_pausedMin", { n: String(min) });
  return t("status_paused");
}

export function traySummary(m: Model, pose: Pose, cockpit: string, mock: boolean, ctx: TrayContext = {}): TrayInfo {
  const now = ctx.now ?? Date.now();
  const n = trayCount(m);
  const state = pose === "offline" ? t("status_offline") : pose === "paused" ? pausedStatus(m, now) : t("status_connected");
  const waiting = n === 0 ? t("trayNothing") : n === 1 ? t("trayOne") : t("trayMany", { n: String(n) });
  const status = [state, waiting, ctx.clickThrough ? t("status_clickThrough") : null, mock ? t("status_mock") : null]
    .filter(Boolean)
    .join(" · ");

  const c = m.counters;
  const counters = t("trayCounters", {
    open: String(c.open),
    protected: String(c.protected),
    granted: String(c.granted),
  });

  const note: TrayLink | null = m.lastNote
    ? { text: [t(m.lastNote.key, m.lastNote.params), shortTime(m.lastNote.time)].filter(Boolean).join(" · "), url: m.lastNote.deepLink ?? null }
    : null;

  const needsYou: TrayLink[] = [];
  if (m.role === "approver") {
    for (const r of m.approverQueue) needsYou.push({ text: `${r.label} · ${t("trayFrom", { from: r.from })}`, url: r.deepLink });
  }
  for (const d of m.drafts) needsYou.push({ text: `${d.label} · ${t("traySignoff")}`, url: d.deepLink });
  for (const d of m.declined) {
    needsYou.push({ text: `${d.label} · ${t("trayDeclined", { approver: d.approver })} · ${age(d.declinedAt, now)}`, url: d.deepLink });
  }

  const withApprover: TrayLink[] = [];
  for (const p of m.pending) {
    const label = p.items && p.items > 1 ? `${p.label} (${t("setOf", { n: String(p.items) })})` : p.label;
    withApprover.push({ text: `${label} · ${t("withApprover", { approver: p.approver })} · ${age(p.sentAt, now)}`, url: p.deepLink });
  }

  const groups: TrayGroup[] = [];
  let room = MAX_ITEMS;
  for (const [title, items] of [
    [t("trayNeedsYou"), needsYou],
    [t("trayWithApprover"), withApprover],
  ] as const) {
    if (items.length === 0 || room === 0) continue;
    groups.push({ title, items: items.slice(0, room) });
    room -= Math.min(room, items.length);
  }

  return {
    status,
    counters,
    note,
    groups,
    details: { text: t("trayDetails"), url: `${cockpit}/access#requests` },
    paused: pose === "paused",
    actions: {
      openCockpit: t("trayOpenCockpit"),
      pause: t("trayPause"),
      pauseTomorrow: t("trayPauseTomorrow"),
      resume: t("trayResume"),
      desktop: t("trayDesktop"),
      clickThrough: t("trayClickThrough"),
      settings: { text: t("traySettings"), url: `${cockpit}/settings#regula-dot` },
      help: { text: t("trayHelp"), url: `${cockpit}/help#regula-dot` },
      quit: t("trayQuit"),
    },
  };
}
