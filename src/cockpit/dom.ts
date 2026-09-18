type Attributes = Record<string, string | number | boolean | undefined>;
type Child = Node | string | number | null | undefined | false;

/**
 * Everything on screen is built from these helpers, which set `textContent`
 * rather than `innerHTML`. Justifications, tool names and rejection reasons are
 * all free text written by one user and read by another, so the safe path has to
 * be the only path.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('data-') || key === 'role' || key.startsWith('aria-')) {
      node.setAttribute(key, String(value));
    } else if (key in node) {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function clear(node: HTMLElement): HTMLElement {
  node.replaceChildren();
  return node;
}

export function table(headers: string[], rows: Child[][]): HTMLTableElement {
  return el(
    'table',
    {},
    el('thead', {}, el('tr', {}, ...headers.map((header) => el('th', { text: header })))),
    el(
      'tbody',
      {},
      ...(rows.length === 0
        ? [el('tr', {}, el('td', { colSpan: headers.length, class: 'muted', text: 'Nothing here yet.' }))]
        : rows.map((cells) => el('tr', {}, ...cells.map((cell) => el('td', {}, cell))))),
    ),
  ) as HTMLTableElement;
}

export function badge(text: string, tone: 'ok' | 'warn' | 'bad' | 'neutral' = 'neutral'): HTMLElement {
  return el('span', { class: `badge badge-${tone}`, text });
}

export function decisionBadge(decision: string): HTMLElement {
  const tone = decision === 'BLOCK' ? 'bad' : decision === 'MAKE_SAFE' ? 'warn' : 'ok';
  return badge(decision.replace('_', ' '), tone);
}

export function section(title: string, subtitle: string | null, ...children: Child[]): HTMLElement {
  return el(
    'section',
    { class: 'card' },
    el('h2', { text: title }),
    subtitle ? el('p', { class: 'muted', text: subtitle }) : null,
    ...children,
  );
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el(
    'label',
    { class: 'field' },
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  );
}

export function formatDate(value: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * A date picker yields a calendar day; an exception needs an instant. "Until
 * 2 November" has to mean the end of 2 November where the people work, not
 * 00:59 on the 3rd, which is what an end-of-day in UTC produces in Zurich.
 */
export function endOfDay(day: string): string {
  if (!day) return '';
  const parts = day.split('-').map(Number);
  const [year, month, date] = parts;
  if (year === undefined || month === undefined || date === undefined) return '';
  return new Date(year, month - 1, date, 23, 59, 59).toISOString();
}

export function formatDateTime(value: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Actions that widen or reset access need a reason, and the reason belongs on
 * screen next to what it justifies rather than in a native prompt the browser
 * strips of context.
 */
export function askForReason(title: string, detail: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('textarea', { rows: 3, required: true }) as HTMLTextAreaElement;
    const confirm = el('button', { type: 'submit', text: 'Confirm' });
    const cancel = el('button', { type: 'button', class: 'link', text: 'Cancel' });

    const form = el(
      'form',
      { class: 'dialog' },
      el('h2', { text: title }),
      el('p', { class: 'muted small', text: detail }),
      field('Reason', input),
      el('div', { class: 'row' }, confirm, cancel),
    ) as HTMLFormElement;

    const backdrop = el('div', { class: 'dialog-backdrop' }, form);
    const close = (value: string | null): void => {
      backdrop.remove();
      resolve(value);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.value.trim() === '') return;
      close(input.value.trim());
    });
    cancel.addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });

    document.body.append(backdrop);
    input.focus();
  });
}
