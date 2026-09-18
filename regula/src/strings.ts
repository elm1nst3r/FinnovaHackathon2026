/**
 * All words Regula ever says. One block per language (PRD F9).
 * Rule: max 12 words, plain, a little dry, never an emoji, never a value.
 */
export type Lang = "en" | "de";

type Table = Record<string, string>;

const en: Table = {
  // bubbles
  working: "Thinking with the assistant.",
  protected: "{rule} kept the {label} masked.",
  pending: "{approver} has your {label} request.",
  granted: "Granted until {until}. Nice.",
  declined: "{approver} left a note. Open it?",
  signoff: "One draft wants a reviewer.",
  signed: "Draft signed. All good.",
  offline: "Cockpit not reachable.",
  approverNew: "{from} sent a request: {label}.",
  paused: "Paused. Back in a bit.",
  // card
  cardTitle: "Regula",
  brand: "Finnova",
  counters: "My access",
  open: "open",
  protectedCount: "protected",
  waiting: "waiting",
  grantedCount: "granted",
  pendingList: "Pending",
  drafts: "Drafts",
  requestsForYou: "Requests for you",
  none: "Nothing pending.",
  openBtn: "Open",
  openCockpit: "Open cockpit",
  pause: "Pause 1 h",
  resume: "Resume",
  clickThrough: "Click-through",
  topBarOnly: "Top bar only",
  status_connected: "Connected",
  status_offline: "Offline",
  status_paused: "Paused",
  status_mock: "Mock feed",
  withApprover: "with {approver}",
  setOf: "set of {n}",
  hint: "Space: next step · R: restart · Esc: close",
};

const de: Table = {
  working: "Denke mit dem Assistenten.",
  protected: "{rule} hat {label} maskiert gelassen.",
  pending: "{approver} hat deine Anfrage: {label}.",
  granted: "Freigegeben bis {until}. Schön.",
  declined: "{approver} hat eine Notiz hinterlassen. Öffnen?",
  signoff: "Ein Entwurf wartet auf Review.",
  signed: "Entwurf freigegeben. Alles gut.",
  offline: "Cockpit nicht erreichbar.",
  approverNew: "{from} hat eine Anfrage gesendet: {label}.",
  paused: "Pausiert. Bin gleich zurück.",
  cardTitle: "Regula",
  brand: "Finnova",
  counters: "Mein Zugriff",
  open: "offen",
  protectedCount: "geschützt",
  waiting: "wartend",
  grantedCount: "freigegeben",
  pendingList: "Ausstehend",
  drafts: "Entwürfe",
  requestsForYou: "Anfragen an dich",
  none: "Nichts ausstehend.",
  openBtn: "Öffnen",
  openCockpit: "Cockpit öffnen",
  pause: "1 h pausieren",
  resume: "Weiter",
  clickThrough: "Durchklicken",
  topBarOnly: "Nur Menüleiste",
  status_connected: "Verbunden",
  status_offline: "Offline",
  status_paused: "Pausiert",
  status_mock: "Mock-Feed",
  withApprover: "bei {approver}",
  setOf: "Set aus {n}",
  hint: "Leertaste: nächster Schritt · R: neu starten · Esc: schliessen",
};

const tables: Record<Lang, Table> = { en, de };

let current: Lang = "en";

export function setLang(lang: string) {
  current = lang === "de" ? "de" : "en";
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, params: Record<string, string> = {}): string {
  const raw = tables[current][key] ?? tables.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
}
