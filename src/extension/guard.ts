import type { DecisionResult } from '../core/engine.ts';
import type { Classification } from '../core/model.ts';
import { detect, raiseClassification, sanitise } from './detect.ts';
import type { DecideMessage, DecideReply } from './background.ts';

const SHADOW_HOST_ID = 'aig-guard-root';
const CLASSIFICATION_KEY = 'aig.classification';

/**
 * The bar and the intervention live in a shadow root. The page's own stylesheet
 * cannot reach in to hide a block notice, and nothing in the page can read the
 * decision back out.
 */
function mountRoot(): ShadowRoot {
  const existing = document.getElementById(SHADOW_HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);
  return shadow;
}

const STYLES = `
:host { all: initial; }
.bar, .sheet {
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #16181d;
}
.bar {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1px solid #e2e5ea; border-radius: 999px;
  padding: 7px 14px; box-shadow: 0 6px 22px rgba(0,0,0,.14); z-index: 2147483646;
}
.bar .dot { width: 9px; height: 9px; border-radius: 50%; background: #1f4ed8; }
.bar select { font: inherit; border: 1px solid #e2e5ea; border-radius: 6px; padding: 2px 6px; }
.bar .stale { color: #9a6100; max-width: 260px; }
.backdrop {
  position: fixed; inset: 0; background: rgba(16,18,22,.55);
  display: flex; align-items: center; justify-content: center; z-index: 2147483647;
}
.sheet {
  background: #fff; border-radius: 12px; padding: 22px; width: min(560px, 92vw);
  max-height: 84vh; overflow: auto; box-shadow: 0 18px 48px rgba(0,0,0,.3);
}
.sheet h2 { margin: 0 0 4px; font-size: 17px; }
.sheet h3 { margin: 18px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #646b78; }
.sheet p { margin: 6px 0; }
.sheet ul { margin: 6px 0; padding-left: 18px; }
.muted { color: #646b78; font-size: 12px; }
.verdict { display: inline-block; font-weight: 650; padding: 2px 9px; border-radius: 999px; font-size: 12px; }
.verdict.block { background: #fdeceb; color: #b4231d; }
.verdict.safe { background: #fdf3e3; color: #9a6100; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
button {
  font: inherit; padding: 7px 14px; border-radius: 7px; cursor: pointer;
  border: 1px solid #1f4ed8; background: #1f4ed8; color: #fff;
}
button.ghost { background: #fff; color: #16181d; border-color: #e2e5ea; }
textarea { width: 100%; font: inherit; padding: 7px; border: 1px solid #e2e5ea; border-radius: 7px; }
.error { color: #b4231d; font-size: 12px; }
`;

// --------------------------------------------------------------- prompt box

type PromptBox = HTMLTextAreaElement | HTMLElement;

function findPromptBox(): PromptBox | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [role="textbox"]'),
  ].filter((node) => node.offsetParent !== null && node.getBoundingClientRect().height > 20);
  return candidates.at(-1) ?? null;
}

function readPrompt(box: PromptBox): string {
  return box instanceof HTMLTextAreaElement ? box.value : (box.textContent ?? '');
}

function writePrompt(box: PromptBox, text: string): void {
  if (box instanceof HTMLTextAreaElement) {
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  box.textContent = text;
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

// ------------------------------------------------------------------ the bar

let declared: Classification = 'INTERNAL';
let staleness: string | null = null;

function renderBar(shadow: ShadowRoot): void {
  shadow.querySelector('.bar')?.remove();

  const bar = document.createElement('div');
  bar.className = 'bar';

  const dot = document.createElement('span');
  dot.className = 'dot';

  const label = document.createElement('span');
  label.textContent = 'AI Guard';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Data classification');
  for (const [value, text] of [
    ['INTERNAL', 'Internal'],
    ['CONFIDENTIAL', 'Confidential'],
    ['STRICTLY_CONFIDENTIAL', 'Strictly confidential'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = value === declared;
    select.append(option);
  }
  select.addEventListener('change', () => {
    declared = select.value as Classification;
    void chrome.storage.local.set({ [CLASSIFICATION_KEY]: declared });
  });

  bar.append(dot, label, select);

  if (staleness) {
    const warning = document.createElement('span');
    warning.className = 'stale';
    warning.textContent = staleness;
    bar.append(warning);
  }

  shadow.append(bar);
}

// ------------------------------------------------------------ intervention

interface Pending {
  box: PromptBox;
  original: string;
  effective: Classification;
  toolId: string;
  reply: DecideReply;
}

function showIntervention(shadow: ShadowRoot, pending: Pending, onProceed: (text: string) => void): void {
  const result = pending.reply.result;
  if (!result) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  backdrop.append(sheet);

  const close = (): void => backdrop.remove();

  const verdict = document.createElement('span');
  verdict.className = `verdict ${result.decision === 'BLOCK' ? 'block' : 'safe'}`;
  verdict.textContent = result.decision === 'BLOCK' ? 'Not allowed' : 'Needs to be made safe';

  const title = document.createElement('h2');
  title.textContent =
    result.decision === 'BLOCK'
      ? `This cannot go to ${result.tool?.name ?? pending.toolId}`
      : 'Some details will be removed first';

  sheet.append(verdict, title);

  if (pending.effective !== declared) {
    const raised = document.createElement('p');
    raised.className = 'muted';
    raised.textContent = `You marked this ${declared.replace(/_/g, ' ').toLowerCase()}, but what you wrote contains personal data, so it is treated as ${pending.effective.replace(/_/g, ' ').toLowerCase()}.`;
    sheet.append(raised);
  }

  const why = document.createElement('h3');
  why.textContent = 'Why';
  const reasons = document.createElement('ul');
  for (const reason of result.reasons) {
    const item = document.createElement('li');
    item.textContent = `${reason.rationale} (${reason.policyId})`;
    reasons.append(item);
  }
  sheet.append(why, reasons);

  if (result.suppressedPolicyIds.length > 0) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = `An exception granted to you suppresses ${result.suppressedPolicyIds.join(', ')}.`;
    sheet.append(note);
  }

  if (pending.reply.staleness) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = pending.reply.staleness;
    sheet.append(note);
  }

  const row = document.createElement('div');
  row.className = 'row';

  if (result.decision === 'MAKE_SAFE') {
    const detection = detect(pending.original);
    const safe = sanitise(pending.original, detection, result.sanitiseCategories);

    const what = document.createElement('h3');
    what.textContent = 'What will change';
    const list = document.createElement('ul');
    for (const replacement of safe.replacements) {
      const item = document.createElement('li');
      item.textContent = `${replacement.count} × ${replacement.category.replace(/_/g, ' ').toLowerCase()} → ${replacement.placeholder}`;
      list.append(item);
    }
    sheet.append(what, list);

    const proceed = document.createElement('button');
    proceed.textContent = 'Replace and send';
    proceed.addEventListener('click', () => {
      writePrompt(pending.box, safe.text);
      close();
      onProceed(safe.text);
    });

    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'Let me edit it myself';
    cancel.addEventListener('click', close);

    row.append(proceed, cancel);
  } else {
    if (result.alternatives.length > 0) {
      const heading = document.createElement('h3');
      heading.textContent = 'What you can use instead';
      const list = document.createElement('ul');
      for (const alternative of result.alternatives) {
        const item = document.createElement('li');
        item.textContent = `${alternative.name} — hosted in ${alternative.hostingRegion}`;
        list.append(item);
      }
      sheet.append(heading, list);
    }

    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'Back to my prompt';
    cancel.addEventListener('click', close);
    row.append(cancel);

    if (result.canRequestAccess) {
      const ask = document.createElement('button');
      ask.textContent = 'Ask for access';
      ask.addEventListener('click', () => showRequestForm(sheet, row, pending, result));
      row.append(ask);
    } else if (result.requestBlockedBy.length > 0) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = `There is no exception to ask for: ${result.requestBlockedBy.join(', ')} cannot be suppressed by anyone.`;
      sheet.append(note);
    }
  }

  sheet.append(row);
  shadow.append(backdrop);
}

function showRequestForm(
  sheet: HTMLElement,
  row: HTMLElement,
  pending: Pending,
  result: DecisionResult,
): void {
  row.remove();

  const heading = document.createElement('h3');
  heading.textContent = 'Why do you need it?';

  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent =
    'Only the tool, the data classification and the rule that stopped you are attached. Your prompt is not sent.';

  const justification = document.createElement('textarea');
  justification.rows = 3;

  const error = document.createElement('p');
  error.className = 'error';

  const submit = document.createElement('button');
  submit.textContent = 'Send request';

  const actions = document.createElement('div');
  actions.className = 'row';
  actions.append(submit);

  submit.addEventListener('click', () => {
    error.textContent = '';
    submit.disabled = true;
    void chrome.runtime
      .sendMessage({
        type: 'AIG_CREATE_REQUEST',
        // Pre-filled from the decision, never from the prompt.
        toolId: result.toolKnown ? (result.tool?.id ?? null) : null,
        toolLabel: result.tool?.name ?? pending.toolId,
        classification: pending.effective,
        blockingPolicyIds: result.blockingPolicyIds,
        justification: justification.value,
      })
      .then((reply: { ok: boolean; id?: string; message?: string }) => {
        submit.disabled = false;
        if (!reply.ok) {
          error.textContent = reply.message ?? 'The request was refused.';
          return;
        }
        sheet.replaceChildren();
        const done = document.createElement('h2');
        done.textContent = 'Request sent';
        const detail = document.createElement('p');
        detail.textContent = `Reference ${reply.id}. You can follow it in the AI Guard cockpit.`;
        const dismiss = document.createElement('button');
        dismiss.textContent = 'Close';
        dismiss.addEventListener('click', () => sheet.closest('.backdrop')?.remove());
        sheet.append(done, detail, dismiss);
      });
  });

  sheet.append(heading, hint, justification, error, actions);
}

// ------------------------------------------------------------------ wiring

function install(): void {
  const shadow = mountRoot();
  renderBar(shadow);

  let allowNext = '';

  const evaluate = async (event: Event): Promise<void> => {
    const box = findPromptBox();
    if (!box) return;

    const prompt = readPrompt(box);
    if (prompt.trim() === '' || prompt === allowNext) return;

    const detection = detect(prompt);
    const effective = raiseClassification(declared, detection.categories);

    event.preventDefault();
    event.stopImmediatePropagation();

    const message: DecideMessage = {
      type: 'AIG_DECIDE',
      host: window.location.hostname,
      toolLabel: document.title,
      classification: effective,
      // Category names only. The prompt stays in this isolated world.
      detectedCategories: detection.categories,
    };

    const reply = (await chrome.runtime.sendMessage(message)) as DecideReply;
    staleness = reply.staleness;
    renderBar(shadow);

    if (!reply.result || reply.result.decision === 'ALLOW') {
      allowNext = prompt;
      resend(box);
      return;
    }

    showIntervention(shadow, { box, original: prompt, effective, toolId: reply.toolId, reply }, (text) => {
      allowNext = text;
      resend(box);
    });
  };

  const resend = (box: PromptBox): void => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  };

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (!target || (target.tagName !== 'TEXTAREA' && target.contentEditable !== 'true')) return;
      void evaluate(event);
    },
    true,
  );
}

void chrome.storage.local.get(CLASSIFICATION_KEY).then((stored) => {
  declared = (stored[CLASSIFICATION_KEY] as Classification | undefined) ?? 'INTERNAL';
  void chrome.runtime.sendMessage({ type: 'AIG_STATUS' }).then((reply: { staleness: string | null }) => {
    staleness = reply.staleness;
    install();
  });
});
