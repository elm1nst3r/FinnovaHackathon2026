/**
 * All words Regula ever says. One block per language (PRD F9).
 * Rule: max 12 words, plain, a little dry, never an emoji, never a value.
 * The product is called regula.dot in every user-facing string.
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
  openFailed: "Could not open that page.",
  welcome: "regula.dot lives in your menu bar. Click the dot for more.",
  // pet
  openBtn: "Open",
  close: "Hide regula.dot (the dot stays in the menu bar)",
  status_connected: "Connected",
  status_offline: "Offline",
  status_paused: "Paused",
  status_pausedMin: "Paused, {n} min left",
  status_pausedHours: "Paused, {n} h left",
  status_clickThrough: "Clicks pass through",
  status_mock: "Mock feed",
  withApprover: "with {approver}",
  setOf: "set of {n}",
  // menu-bar dropdown
  trayNothing: "Nothing waiting",
  trayOne: "1 item waiting",
  trayMany: "{n} items waiting",
  trayCounters: "In the cockpit: {open} open · {protected} protected · {granted} granted",
  trayNeedsYou: "Needs you",
  trayWithApprover: "With the approver",
  trayDetails: "Open requests in the cockpit",
  traySignoff: "needs sign-off",
  trayFrom: "from {from}",
  trayDeclined: "declined by {approver}",
  ageNow: "just now",
  ageMin: "{n} min",
  ageHours: "{n} h",
  ageDays: "{n} d",
  // menu-bar dropdown: fixed actions
  trayOpenCockpit: "Open cockpit",
  trayPause: "Pause reactions for 1 h",
  trayPauseTomorrow: "Pause reactions until tomorrow",
  trayResume: "Resume reactions",
  trayDesktop: "Show regula.dot on the desktop",
  trayClickThrough: "Let clicks pass through regula.dot",
  traySettings: "Manage settings in the cockpit…",
  trayHelp: "What is regula.dot?",
  trayQuit: "Quit regula.dot",
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
  openFailed: "Seite konnte nicht geöffnet werden.",
  welcome: "regula.dot wohnt in der Menüleiste. Klick den Punkt für mehr.",
  openBtn: "Öffnen",
  close: "regula.dot ausblenden (der Punkt bleibt in der Menüleiste)",
  status_connected: "Verbunden",
  status_offline: "Offline",
  status_paused: "Pausiert",
  status_pausedMin: "Pausiert, noch {n} min",
  status_pausedHours: "Pausiert, noch {n} h",
  status_clickThrough: "Klicks gehen durch",
  status_mock: "Mock-Feed",
  withApprover: "bei {approver}",
  setOf: "Set aus {n}",
  trayNothing: "Nichts wartet",
  trayOne: "1 Eintrag wartet",
  trayMany: "{n} Einträge warten",
  trayCounters: "Im Cockpit: {open} offen · {protected} geschützt · {granted} freigegeben",
  trayNeedsYou: "Braucht dich",
  trayWithApprover: "Beim Approver",
  trayDetails: "Anfragen im Cockpit öffnen",
  traySignoff: "braucht Review",
  trayFrom: "von {from}",
  trayDeclined: "abgelehnt von {approver}",
  ageNow: "gerade eben",
  ageMin: "{n} min",
  ageHours: "{n} h",
  ageDays: "{n} T",
  trayOpenCockpit: "Cockpit öffnen",
  trayPause: "Reaktionen 1 h pausieren",
  trayPauseTomorrow: "Reaktionen bis morgen pausieren",
  trayResume: "Reaktionen fortsetzen",
  trayDesktop: "regula.dot auf dem Desktop zeigen",
  trayClickThrough: "Klicks durch regula.dot durchlassen",
  traySettings: "Einstellungen im Cockpit verwalten…",
  trayHelp: "Was ist regula.dot?",
  trayQuit: "regula.dot beenden",
};

const tables: Record<Lang, Table> = { en, de };

let current: Lang = "en";

export function setLang(lang: string) {
  current = lang === "de" ? "de" : "en";
}

export function getLang(): Lang {
  return current;
}

/** BCP 47 tag for dates and times, so they follow `--lang`, not the OS locale. */
export function getLocale(): string {
  return current === "de" ? "de-CH" : "en-GB";
}

export function t(key: string, params: Record<string, string> = {}): string {
  const raw = tables[current][key] ?? tables.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
}
