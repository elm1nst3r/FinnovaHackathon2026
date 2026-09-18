import { api, ApiFailure } from '../api.ts';
import type { SessionResponse } from '../api.ts';
import { badge, clear, decisionBadge, el, field, formatDate, formatDateTime, section, table } from '../dom.ts';
import { clearLocalHistory, loadLocalHistory } from '../history-bridge.ts';
import type { Classification, Tool } from '../../core/model.ts';

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
      // Same calendar day here as in the exceptions list below: both format
      // the same instant in the same place.
      const until = cell.wideningExceptionIds
        .map((id) => exceptions.find((exception) => exception.id === id))
        .filter((exception) => exception !== undefined)
        .map((exception) => `until ${formatDate(exception.expiresAt)}`)
        .join(', ');
      return el(
        'div',
        {},
        badge(cell.permitted ? 'yes' : 'no', cell.permitted ? 'ok' : 'bad'),
        el('div', { class: 'muted small', text: until ? `${cell.reason} ${until}.` : cell.reason }),
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
  const [{ requests }, registry] = await Promise.all([api.myRequests(), api.registry()]);
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
        ? `${request.grant.toolId} · ${request.grant.classifications
            .map((classification) => classification.replace(/_/g, ' ').toLowerCase())
            .join(', ')} — granted until ${formatDate(request.grant.expiresAt)} (${request.grant.id})`
        : (last?.reason ?? '—'),
    ];
  });

  host.append(
    section(
      'Your requests',
      null,
      table(['Raised', 'Scope', 'State', 'Outcome'], rows),
      newRequestForm(registry.tools, () => void renderRequests(host)),
    ),
  );
}

const OTHER_TOOL = '__other__';

function newRequestForm(tools: Tool[], onSubmitted: () => void): HTMLElement {
  // A registered tool is chosen by id so that approval can actually grant
  // something; free text is reserved for tools governance has never seen.
  const tool = el(
    'select',
    {},
    ...tools.map((entry) => el('option', { value: entry.id, text: entry.name })),
    el('option', { value: OTHER_TOOL, text: 'Another tool (not in the registry)' }),
  ) as HTMLSelectElement;
  const otherTool = el('input', { type: 'text', placeholder: 'Name of the tool' }) as HTMLInputElement;
  const otherField = field('Which tool?', otherTool);
  otherField.hidden = true;
  tool.addEventListener('change', () => {
    otherField.hidden = tool.value !== OTHER_TOOL;
  });
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
    otherField,
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
        const registered = tools.find((entry) => entry.id === tool.value);
        const isOther = tool.value === OTHER_TOOL || !registered;
        if (isOther && otherTool.value.trim() === '') {
          feedback.textContent = 'Name the tool you are asking for.';
          return;
        }
        await api.createRequest({
          toolId: registered?.id ?? null,
          toolLabel: registered?.name ?? otherTool.value.trim(),
          classification: classification.value as Classification,
          // A manual request has no intervention behind it, so it names the
          // rule that would govern the scope: the tool rule for an unknown or
          // unapproved tool, the confidentiality rule for an approved one.
          blockingPolicyIds:
            !registered || registered.approvalStatus !== 'APPROVED' ? ['CH-AI-TOOL-01'] : ['CH-AI-CONF-01'],
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
