import { api, ApiFailure } from '../api.ts';
import type { SessionResponse } from '../api.ts';
import { badge, clear, decisionBadge, el, field, formatDate, formatDateTime, section, table } from '../dom.ts';
import { clearLocalHistory, loadLocalHistory } from '../history-bridge.ts';
import type { Classification } from '../../core/model.ts';

export async function renderEmployeeView(root: HTMLElement, session: SessionResponse): Promise<void> {
  clear(root);
  root.append(
    el('h1', { text: `Your AI usage, ${session.identity.displayName.split(' ')[0]}` }),
    el('p', {
      class: 'lede',
      text: 'What you may use, what AI Guard decided, and what happened to your requests.',
    }),
  );

  const permissions = el('div');
  const history = el('div');
  const requests = el('div');
  root.append(permissions, history, requests);

  await Promise.all([
    renderPermissions(permissions),
    renderHistory(history),
    renderRequests(requests),
  ]);
}

// ------------------------------------------------------------- permissions

async function renderPermissions(host: HTMLElement): Promise<void> {
  const [{ permissions }, { exceptions }] = await Promise.all([api.myPermissions(), api.myExceptions()]);
  const classifications: Classification[] = ['INTERNAL', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL'];

  const rows = permissions.map((entry) => [
    el(
      'div',
      {},
      el('strong', { text: entry.tool.name }),
      el('div', { class: 'muted small', text: `${entry.tool.hostingRegion} · ${entry.tool.approvalStatus.replace('_', ' ').toLowerCase()}` }),
    ),
    ...classifications.map((classification) => {
      const cell = entry.cells.find((candidate) => candidate.classification === classification);
      if (!cell) return el('span', { text: '—' });
      return el(
        'div',
        {},
        badge(cell.permitted ? 'yes' : 'no', cell.permitted ? 'ok' : 'bad'),
        el('div', { class: 'muted small', text: cell.reason }),
      );
    }),
  ]);

  clear(host).append(
    section(
      'What you may use',
      'Tools you may not use are listed too, with the reason — that is usually the question you actually arrived with.',
      table(['Tool', 'Internal', 'Confidential', 'Strictly confidential'], rows),
      exceptions.length === 0
        ? el('p', { class: 'muted small', text: 'You have no active exceptions.' })
        : el(
            'div',
            { class: 'subsection' },
            el('h3', { text: 'Exceptions granted to you' }),
            table(
              ['Reference', 'Scope', 'Justification', 'Expires'],
              exceptions.map((exception) => [
                exception.id,
                `${exception.scope.toolId} · ${exception.scope.classifications.join(', ')}`,
                exception.justification,
                formatDate(exception.expiresAt),
              ]),
            ),
            el('p', {
              class: 'muted small',
              text: 'Nothing is enforced against you that you cannot see here.',
            }),
          ),
    ),
  );
}

// ----------------------------------------------------------------- history

async function renderHistory(host: HTMLElement): Promise<void> {
  const result = await loadLocalHistory();
  clear(host);

  if (!result.available) {
    host.append(
      section(
        'Your history',
        null,
        el('p', {
          text: 'No AI Guard enforcement point answered on this device, so there is no history to show.',
        }),
        el('p', {
          class: 'muted small',
          text: 'Your history is stored by the browser extension on the device where the interactions happened. It is not on any server, so the cockpit cannot fetch it for you.',
        }),
      ),
    );
    return;
  }

  const clearButton = el('button', { class: 'danger', type: 'button', text: 'Clear my history' });
  clearButton.addEventListener('click', () => {
    void (async () => {
      clearButton.disabled = true;
      await clearLocalHistory();
      await renderHistory(host);
    })();
  });

  host.append(
    section(
      'Your history',
      `${result.entries.length} decision(s) on this device. Nobody else can read this.`,
      table(
        ['When', 'Tool', 'Classification', 'Decision', 'Policies', 'Detected'],
        result.entries.map((entry) => [
          formatDateTime(entry.at),
          entry.toolLabel,
          entry.classification.replace('_', ' ').toLowerCase(),
          decisionBadge(entry.decision),
          entry.policyIds.join(', ') || '—',
          entry.detectedCategories.join(', ') || '—',
        ]),
      ),
      el(
        'div',
        { class: 'row' },
        clearButton,
        el('p', {
          class: 'muted small',
          text: 'History is local to this device and this browser, ages out automatically, and clearing it notifies nobody.',
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- requests

async function renderRequests(host: HTMLElement): Promise<void> {
  const { requests } = await api.myRequests();
  clear(host);

  const rows = requests.map((request) => {
    const last = request.transitions.at(-1);
    return [
      formatDate(request.createdAt),
      `${request.toolLabel} · ${request.classification.replace('_', ' ').toLowerCase()}`,
      badge(
        request.state.replace('_', ' ').toLowerCase(),
        request.state === 'APPROVED' ? 'ok' : request.state === 'REJECTED' ? 'bad' : 'warn',
      ),
      request.grant
        ? `Granted until ${formatDate(request.grant.expiresAt)} (${request.grant.id})`
        : (last?.reason ?? '—'),
    ];
  });

  host.append(
    section(
      'Your requests',
      null,
      table(['Raised', 'Scope', 'State', 'Outcome'], rows),
      newRequestForm(() => void renderRequests(host)),
    ),
  );
}

function newRequestForm(onSubmitted: () => void): HTMLElement {
  const tool = el('input', { type: 'text', placeholder: 'e.g. ChatGPT Enterprise', required: true });
  const classification = el(
    'select',
    {},
    el('option', { value: 'INTERNAL', text: 'Internal' }),
    el('option', { value: 'CONFIDENTIAL', text: 'Confidential' }),
  ) as HTMLSelectElement;
  const justification = el('textarea', { rows: 3, required: true }) as HTMLTextAreaElement;
  const feedback = el('p', { class: 'form-error' });

  const form = el(
    'form',
    { class: 'subsection' },
    el('h3', { text: 'Ask for something else' }),
    el('p', {
      class: 'muted small',
      text: 'Normally you raise a request straight from the intervention that blocked you, and only the justification is left to fill in. This form is the manual route.',
    }),
    field('Tool', tool),
    field('Data classification', classification),
    field('Why do you need it?', justification, 'One or two sentences is enough.'),
    feedback,
    el('button', { type: 'submit', text: 'Submit request' }),
  ) as HTMLFormElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    feedback.textContent = '';
    void (async () => {
      try {
        await api.createRequest({
          toolId: null,
          toolLabel: tool.value,
          classification: classification.value as Classification,
          // A manual request has no intervention behind it, so it names the
          // rule that governs the tool rather than one that actually fired.
          blockingPolicyIds: ['CH-AI-TOOL-01'],
          justification: justification.value,
        });
        form.reset();
        onSubmitted();
      } catch (error) {
        feedback.textContent =
          error instanceof ApiFailure ? error.errors.map((entry) => entry.message).join(' ') : 'Something went wrong.';
      }
    })();
  });

  return form;
}
