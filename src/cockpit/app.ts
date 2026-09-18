import { api, ApiFailure, currentIdentityId, setIdentityId } from './api.ts';
import type { SessionResponse } from './api.ts';
import { clear, el } from './dom.ts';
import { renderEmployeeView } from './views/employee.ts';
import { renderGovernanceView } from './views/governance.ts';

type ViewId = 'employee' | 'governance';

const VIEW_KEY = 'aig.view';

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  let session: SessionResponse;
  try {
    session = await api.session();
  } catch (error) {
    renderUnavailable(root, error);
    return;
  }

  const stored = sessionStorage.getItem(VIEW_KEY) as ViewId | null;
  // A view you are not entitled to is not a view you can restore into.
  const view: ViewId = stored && session.views.includes(stored) ? stored : (session.views[0] ?? 'employee');
  render(root, session, view);
}

function render(root: HTMLElement, session: SessionResponse, view: ViewId): void {
  sessionStorage.setItem(VIEW_KEY, view);
  clear(root);

  const content = el('main', { class: 'content' });
  root.append(header(session, view, (next) => render(root, session, next)), content);

  content.append(el('p', { class: 'muted', text: 'Loading…' }));
  const draw = view === 'governance' ? renderGovernanceView(content) : renderEmployeeView(content, session);
  void draw.catch((error: unknown) => renderUnavailable(content, error));
}

function header(session: SessionResponse, view: ViewId, onSwitch: (view: ViewId) => void): HTMLElement {
  /**
   * The switcher only exists for people who hold both roles. An employee never
   * sees a greyed-out governance tab, because a control you cannot use is just a
   * reminder that somebody is watching.
   */
  const switcher =
    session.views.length > 1
      ? el(
          'nav',
          { class: 'view-switch', role: 'tablist' },
          ...session.views.map((candidate) => {
            const button = el('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': candidate === view,
              class: candidate === view ? 'view-tab view-tab-active' : 'view-tab',
              text: candidate === 'governance' ? 'Governance' : 'My usage',
            });
            button.addEventListener('click', () => onSwitch(candidate));
            return button;
          }),
        )
      : null;

  return el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'brand' }, el('span', { class: 'dot' }), el('strong', { text: 'AI Guard' })),
    switcher,
    personaPicker(session),
  );
}

/**
 * Identity is mocked for the prototype, so the mock is visible rather than
 * hidden. A demo that pretends to have SSO invites exactly the questions the
 * demo cannot answer.
 */
function personaPicker(session: SessionResponse): HTMLElement {
  const select = el(
    'select',
    { class: 'persona', 'aria-label': 'Demo identity' },
    ...session.availableIdentities.map((identity) =>
      el('option', {
        value: identity.id,
        text: `${identity.displayName}${identity.governance ? ' · governance' : ''}`,
        selected: identity.id === currentIdentityId(),
      }),
    ),
  ) as HTMLSelectElement;

  select.addEventListener('change', () => {
    setIdentityId(select.value);
    sessionStorage.removeItem(VIEW_KEY);
    window.location.reload();
  });

  return el('div', { class: 'persona-wrap' }, el('span', { class: 'tag', text: 'demo identity' }), select);
}

function renderUnavailable(host: HTMLElement, error: unknown): void {
  const detail =
    error instanceof ApiFailure
      ? error.errors.map((entry) => entry.message).join(' ') || `The service answered ${error.status}.`
      : 'The policy service did not answer.';

  clear(host).append(
    el(
      'div',
      { class: 'card' },
      el('h2', { text: 'The cockpit cannot reach the policy service' }),
      el('p', { text: detail }),
      el('p', {
        class: 'muted small',
        text: 'Enforcement is unaffected: the extension keeps applying the last policy version it successfully fetched and marks its decisions as based on a stale policy set.',
      }),
    ),
  );
}

void boot();
