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
  // pet
  openBtn: "Open",
  close: "Hide Regula (the dot stays in the menu bar)",
  status_connected: "Connected",
  status_offline: "Offline",
  status_paused: "Paused",
  status_mock: "Mock feed",
  withApprover: "with {approver}",
  setOf: "set of {n}",
  // menu-bar dropdown
  trayNothing: "Nothing waiting for you",
  trayOne: "1 item waiting for you",
  trayMany: "{n} items waiting for you",
  trayCounters: "{open} open · {protected} protected · {waiting} waiting · {granted} granted",
  trayDetails: "Open details in the cockpit",
  traySignoff: "needs sign-off",
  trayFrom: "from {from}",
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
  openBtn: "Öffnen",
  close: "Regula ausblenden (der Punkt bleibt in der Menüleiste)",
  status_connected: "Verbunden",
  status_offline: "Offline",
  status_paused: "Pausiert",
  status_mock: "Mock-Feed",
  withApprover: "bei {approver}",
  setOf: "Set aus {n}",
  trayNothing: "Nichts wartet auf dich",
  trayOne: "1 Eintrag wartet auf dich",
  trayMany: "{n} Einträge warten auf dich",
  trayCounters: "{open} offen · {protected} geschützt · {waiting} wartend · {granted} freigegeben",
  trayDetails: "Details im Cockpit öffnen",
  traySignoff: "braucht Review",
  trayFrom: "von {from}",
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
