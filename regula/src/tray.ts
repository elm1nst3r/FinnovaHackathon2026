/**
 * What the menu-bar dropdown shows: a status line, the four counters, the last
 * thing Regula said, one entry per item waiting on the user, and the link to
 * the details in the cockpit. Pure: model in, strings out. The Rust shell
 * renders it as native menu items and opens the links; nothing here navigates.
 */
import { trayCount, type Model } from "./state";
import type { Pose } from "./types";
import { t } from "./strings";

export type TrayLink = { text: string; url: string | null };

export type TrayInfo = {
  status: string;
  counters: string;
  /** The last thing Regula said, clickable when it had a deep link. */
  note: TrayLink | null;
  /** Items waiting on the user, each opening its cockpit deep link. */
  items: TrayLink[];
  details: TrayLink;
};

/** Menus grow tall quickly; the cockpit shows the rest. */
const MAX_ITEMS = 8;

export function traySummary(m: Model, pose: Pose, cockpit: string, mock: boolean): TrayInfo {
  const n = trayCount(m);
  const state = pose === "offline" ? t("status_offline") : pose === "paused" ? t("status_paused") : t("status_connected");
  const waiting = n === 0 ? t("trayNothing") : n === 1 ? t("trayOne") : t("trayMany", { n: String(n) });
  const status = [state, waiting, mock ? t("status_mock") : null].filter(Boolean).join(" · ");

  const c = m.counters;
  const counters = t("trayCounters", {
    open: String(c.open),
    protected: String(c.protected),
    waiting: String(c.waiting),
    granted: String(c.granted),
  });

  const note: TrayLink | null = m.lastNote ? { text: t(m.lastNote.key, m.lastNote.params), url: m.lastNote.deepLink ?? null } : null;

  const items: TrayLink[] = [];
  if (m.role === "approver") {
    for (const r of m.approverQueue) items.push({ text: `${r.label} · ${r.ruleId} · ${t("trayFrom", { from: r.from })}`, url: r.deepLink });
  }
  for (const p of m.pending) {
    const label = p.items && p.items > 1 ? `${p.label} (${t("setOf", { n: String(p.items) })})` : p.label;
    items.push({ text: `${label} · ${p.ruleId} · ${t("withApprover", { approver: p.approver })}`, url: p.deepLink });
  }
  for (const d of m.drafts) items.push({ text: `${d.label} · ${t("traySignoff")}`, url: d.deepLink });

  return {
    status,
    counters,
    note,
    items: items.slice(0, MAX_ITEMS),
    details: { text: t("trayDetails"), url: `${cockpit}/access#requests` },
  };
}
