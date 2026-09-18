/**
 * "Ask regula.dot": injected into the page when the user picks the item from
 * the right-click menu on a selection. The item exists only while regula.dot
 * is switched off, when nothing is checked on Enter, and it answers the
 * question the guard would otherwise answer then: what is in this text, how is
 * it classified, and which AI tool may it go to.
 *
 * The selection is read here, in the isolated world, and never leaves it: only
 * category names go to the service worker, and nothing is written to history
 * or the audit log, because nothing was sent anywhere.
 */
import { SANITISABLE_CATEGORIES } from '../core/model.ts';
import type { Classification, Decision, DetectionCategory } from '../core/model.ts';
import { detect, raiseClassification, sanitise } from './detect.ts';
import type { DetectionResult } from './detect.ts';
import { mountRoot } from './overlay.ts';
import type { AskMessage, AskReply, AskVerdict } from './ask-verdict.ts';

const HOST_ID = 'aig-ask-root';
const CLASSIFICATION_KEY = 'aig.classification';

const CATEGORY_LABEL: Record<DetectionCategory, string> = {
  PERSON_NAME: 'person name',
  EMAIL: 'email address',
  PHONE: 'phone number',
  IBAN: 'IBAN',
  CREDENTIAL: 'credential',
  SPECIAL_CATEGORY: 'special category of personal data',
};

const DECISION_LABEL: Record<Decision, string> = {
  ALLOW: 'Allowed',
  MAKE_SAFE: 'Allowed after masking',
  BLOCK: 'Not allowed',
};

const DECISION_CLASS: Record<Decision, string> = { ALLOW: 'allow', MAKE_SAFE: 'safe', BLOCK: 'block' };

// ---------------------------------------------------------------- selection

/**
 * The selected text. Inside a text field the document selection is empty in
 * some browsers, so the field's own selection range is read first.
 */
function readSelection(): string {
  const field = document.activeElement;
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    try {
      const { selectionStart, selectionEnd, value } = field;
      if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
        return value.slice(selectionStart, selectionEnd);
      }
    } catch {
      // Input types without a selection (email, number) throw in some engines.
    }
  }
  return window.getSelection()?.toString() ?? '';
}

function countByCategory(detection: DetectionResult): { category: DetectionCategory; count: number }[] {
  const counts = new Map<DetectionCategory, number>();
  for (const span of detection.spans) counts.set(span.category, (counts.get(span.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

function plain(classification: Classification): string {
  return classification.replace(/_/g, ' ').toLowerCase();
}

// ------------------------------------------------------------------- sheet

function openSheet(shadow: ShadowRoot): { sheet: HTMLElement; close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  backdrop.append(sheet);
  shadow.append(backdrop);

  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  return { sheet, close };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | null,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function showEmpty(shadow: ShadowRoot): void {
  const { sheet, close } = openSheet(shadow);
  sheet.append(
    element('h2', null, 'Nothing selected'),
    element('p', 'muted', 'Select the text you want to ask regula.dot about, then right-click it.'),
  );
  const row = element('div', 'row', '');
  const back = element('button', 'ghost', 'Close');
  back.addEventListener('click', close);
  row.append(back);
  sheet.append(row);
}

function renderTool(verdict: AskVerdict): HTMLElement {
  const tool = element('div', 'tool', '');
  const head = element('div', 'head', '');
  const name = element('span', 'name', verdict.here ? `${verdict.toolName} (this page)` : verdict.toolName);
  const pill = element('span', `verdict ${DECISION_CLASS[verdict.decision]}`, DECISION_LABEL[verdict.decision]);
  head.append(name, pill);
  tool.append(head);

  const region = verdict.approved
    ? `Approved, hosted in ${verdict.hostingRegion}`
    : 'Not approved by the bank';
  tool.append(element('p', 'muted', region));

  for (const reason of verdict.reasons) {
    tool.append(element('p', 'muted', `${reason.rationale} (${reason.policyId})`));
  }
  if (verdict.suppressedPolicyIds.length > 0) {
    tool.append(element('p', 'muted', `An exception granted to you suppresses ${verdict.suppressedPolicyIds.join(', ')}.`));
  }
  return tool;
}

function showAnswer(
  shadow: ShadowRoot,
  text: string,
  detection: DetectionResult,
  declared: Classification,
  effective: Classification,
  reply: AskReply,
): void {
  const { sheet, close } = openSheet(shadow);

  const hasCredential = detection.categories.includes('CREDENTIAL');
  const hasSpecial = detection.categories.includes('SPECIAL_CATEGORY');
  const pill =
    detection.categories.length === 0
      ? element('span', 'verdict allow', 'Nothing sensitive found')
      : hasCredential || hasSpecial
        ? element('span', 'verdict block', 'Must not leave the bank')
        : element('span', 'verdict safe', 'Contains personal data');
  sheet.append(pill, element('h2', null, 'What regula.dot found in your selection'));

  sheet.append(
    element(
      'p',
      'muted',
      effective === declared
        ? `Treated as ${plain(effective)}, as you marked it.`
        : `You marked this ${plain(declared)}, but it contains personal data, so it is treated as ${plain(effective)}.`,
    ),
  );

  sheet.append(element('h3', null, 'In the text'));
  const found = countByCategory(detection);
  if (found.length === 0) {
    sheet.append(element('p', null, 'No personal data, credentials or special categories.'));
  } else {
    const list = document.createElement('ul');
    for (const { category, count } of found) list.append(element('li', null, `${count} × ${CATEGORY_LABEL[category]}`));
    sheet.append(list);
  }

  sheet.append(element('h3', null, 'Where it may go'));
  if (!reply.verdicts) {
    sheet.append(
      element(
        'p',
        null,
        reply.staleness ??
          'The policy service could not be reached and nothing has been cached on this device, so there are no rules to apply yet.',
      ),
    );
  } else if (reply.verdicts.length === 0) {
    sheet.append(element('p', null, 'The tool registry is empty; there is nowhere approved to send it.'));
  } else {
    for (const verdict of reply.verdicts) sheet.append(renderTool(verdict));
  }

  const row = element('div', 'row', '');

  const safeCategories = detection.categories.filter((category) => SANITISABLE_CATEGORIES.includes(category));
  if (safeCategories.length > 0) {
    const safe = sanitise(text, detection, safeCategories);
    sheet.append(element('h3', null, 'A safe version would change'));
    const list = document.createElement('ul');
    for (const replacement of safe.replacements) {
      list.append(
        element('li', null, `${replacement.count} × ${CATEGORY_LABEL[replacement.category]} → ${replacement.placeholder}`),
      );
    }
    sheet.append(list);

    const copy = element('button', null, 'Copy the safe version');
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(safe.text).then(
        () => {
          copy.textContent = 'Copied';
          copy.disabled = true;
        },
        () => {
          copy.textContent = 'Could not copy';
        },
      );
    });
    row.append(copy);
  }

  const done = element('button', 'ghost', 'Close');
  done.addEventListener('click', close);
  row.append(done);
  sheet.append(row);

  const footer = [
    'Nothing was sent anywhere and nothing was recorded. The text stayed in this tab.',
    reply.staleness,
  ]
    .filter(Boolean)
    .join(' ');
  sheet.append(element('p', 'muted', footer));
}

// -------------------------------------------------------------------- run

async function ask(): Promise<void> {
  const text = readSelection().trim();
  const shadow = mountRoot(HOST_ID);
  if (text === '') {
    showEmpty(shadow);
    return;
  }

  const stored = await chrome.storage.local.get(CLASSIFICATION_KEY);
  const declared = (stored[CLASSIFICATION_KEY] as Classification | undefined) ?? 'INTERNAL';
  const detection = detect(text);
  const effective = raiseClassification(declared, detection.categories);

  const message: AskMessage = {
    type: 'AIG_ASK',
    host: window.location.hostname,
    classification: effective,
    // Category names only. The selection stays in this isolated world.
    detectedCategories: detection.categories,
  };
  const reply = (await chrome.runtime.sendMessage(message)) as AskReply;
  showAnswer(shadow, text, detection, declared, effective, reply);
}

void ask();
