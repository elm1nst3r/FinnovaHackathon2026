/**
 * The compact card: four access counters, the pending list with rule ids,
 * and a button per item that deep-links into the cockpit. Fits 320 x 240.
 */
import type { Model } from "./state";
import type { Pose } from "./types";
import { t } from "./strings";

export type CardHandlers = {
  open(url: string): void;
  togglePause(): void;
  toggleClickThrough(): void;
  hideToTopBar(): void;
};

export type CardOptions = {
  cockpit: string;
  mock: boolean;
  hint: string | null;
  clickThrough: boolean;
  /** False in the browser preview, where there is no menu bar to hide into. */
  canHide: boolean;
};

const h = (tag: string, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function openButton(url: string, handlers: CardHandlers, label = t("openBtn")) {
  const b = h("button", "btn btn-primary", label) as HTMLButtonElement;
  b.type = "button";
  b.addEventListener("click", () => handlers.open(url));
  return b;
}

export function renderCard(el: HTMLElement, m: Model, pose: Pose, opts: CardOptions, handlers: CardHandlers) {
  const paused = pose === "paused";
  el.replaceChildren();

  // Header
  const header = h("header", "card-header");
  const brand = h("span", "brand", t("brand"));
  brand.appendChild(h("i", "brand-dot"));
  header.appendChild(brand);
  header.appendChild(h("span", "card-title", t("cardTitle")));
  const role = h("span", "role mono", m.role === "approver" ? "approver" : "advisor");
  header.appendChild(role);
  el.appendChild(header);

  // Counters
  const counters = h("section", "counters");
  const tile = (n: number, label: string, cls: string) => {
    const d = h("div", `tile ${cls}`);
    d.appendChild(h("span", "num mono", String(n)));
    d.appendChild(h("span", "lbl", label));
    return d;
  };
  counters.appendChild(tile(m.counters.open, t("open"), "open"));
  counters.appendChild(tile(m.counters.protected, t("protectedCount"), "protected"));
  counters.appendChild(tile(m.counters.waiting, t("waiting"), "waiting"));
  counters.appendChild(tile(m.counters.granted, t("grantedCount"), "granted"));
  el.appendChild(counters);

  // Lists
  const lists = h("section", "lists");
  if (m.role === "approver" && m.approverQueue.length) {
    lists.appendChild(h("h3", undefined, `${t("requestsForYou")} · ${m.approverQueue.length}`));
    for (const r of m.approverQueue.slice(0, 3)) {
      const row = h("div", "row");
      const info = h("div", "info");
      info.appendChild(h("span", "label", r.label));
      info.appendChild(h("span", "meta", `${r.ruleId} · ${r.from}`)).classList.add("mono");
      row.appendChild(info);
      row.appendChild(openButton(r.deepLink, handlers));
      lists.appendChild(row);
    }
  }
  if (m.pending.length) {
    lists.appendChild(h("h3", undefined, t("pendingList")));
    for (const p of m.pending) {
      const row = h("div", "row");
      const info = h("div", "info");
      const label = p.items && p.items > 1 ? `${p.label} (${t("setOf", { n: String(p.items) })})` : p.label;
      info.appendChild(h("span", "label", label));
      const meta = h("span", "meta");
      meta.appendChild(h("span", "mono", p.ruleId));
      meta.appendChild(document.createTextNode(` · ${t("withApprover", { approver: p.approver })}`));
      info.appendChild(meta);
      row.appendChild(info);
      row.appendChild(openButton(p.deepLink, handlers));
      lists.appendChild(row);
    }
  }
  if (m.drafts.length) {
    lists.appendChild(h("h3", undefined, t("drafts")));
    for (const d of m.drafts) {
      const row = h("div", "row");
      const info = h("div", "info");
      info.appendChild(h("span", "label", d.label));
      info.appendChild(h("span", "meta", t("signoff")));
      row.appendChild(info);
      row.appendChild(openButton(d.deepLink, handlers));
      lists.appendChild(row);
    }
  }
  if (!m.pending.length && !m.drafts.length && !(m.role === "approver" && m.approverQueue.length)) {
    lists.appendChild(h("p", "empty", t("none")));
  }
  el.appendChild(lists);

  // Footer
  const footer = h("footer", "card-footer");
  const status = h("span", `status status-${pose === "offline" ? "offline" : paused ? "paused" : "ok"}`);
  status.appendChild(h("i", "dot"));
  const statusLabel = pose === "offline" ? t("status_offline") : paused ? t("status_paused") : t("status_connected");
  status.appendChild(h("span", undefined, opts.mock ? `${statusLabel} · ${t("status_mock")}` : statusLabel));
  footer.appendChild(status);

  const actions = h("div", "actions");
  const pauseBtn = h("button", "btn", paused ? t("resume") : t("pause")) as HTMLButtonElement;
  pauseBtn.type = "button";
  pauseBtn.addEventListener("click", () => handlers.togglePause());
  actions.appendChild(pauseBtn);
  const ct = h("button", `btn${opts.clickThrough ? " on" : ""}`, t("clickThrough")) as HTMLButtonElement;
  ct.type = "button";
  ct.title = "Cursor falls through Regula. Turn off again from the tray.";
  ct.addEventListener("click", () => handlers.toggleClickThrough());
  actions.appendChild(ct);
  if (opts.canHide) {
    const hide = h("button", "btn", t("topBarOnly")) as HTMLButtonElement;
    hide.type = "button";
    hide.title = "Regula stays as the dot in the menu bar. Bring it back from there.";
    hide.addEventListener("click", () => handlers.hideToTopBar());
    actions.appendChild(hide);
  }
  actions.appendChild(openButton(`${opts.cockpit}/access#requests`, handlers, t("openCockpit")));
  footer.appendChild(actions);
  el.appendChild(footer);

  if (opts.mock) {
    const hint = h("p", "hint mono", opts.hint ? `next: ${opts.hint} · ${t("hint")}` : t("hint"));
    el.appendChild(hint);
  }
}
