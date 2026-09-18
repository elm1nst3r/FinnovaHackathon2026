import { api, ApiFailure } from '../api.ts';
import { askForReason, badge, clear, el, endOfDay, field, formatDate, formatDateTime, section, table } from '../dom.ts';
import {
  CLASSIFICATIONS,
  DECISIONS,
  NON_SUPPRESSIBLE_POLICY_IDS,
  POLICY_INPUTS,
  isSuppressible,
} from '../../core/model.ts';
import type { Classification, Condition, Policy, Tool } from '../../core/model.ts';
import { SUPPORTED_OPERATORS, VALUE_DOMAINS, describeCondition, describePolicy } from '../../core/policy.ts';

const PANELS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'tools', label: 'Tools' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'requests', label: 'Requests' },
  { id: 'changes', label: 'Change log' },
] as const;

type PanelId = (typeof PANELS)[number]['id'];

export async function renderGovernanceView(root: HTMLElement, panel: PanelId = 'overview'): Promise<void> {
  clear(root);

  const body = el('div');
  const tabs = el(
    'nav',
    { class: 'tabs' },
    ...PANELS.map((entry) => {
      const button = el('button', {
        type: 'button',
        class: entry.id === panel ? 'tab tab-active' : 'tab',
        text: entry.label,
      });
      button.addEventListener('click', () => void renderGovernanceView(root, entry.id));
      return button;
    }),
  );

  root.append(
    el('h1', { text: 'AI governance' }),
    el('p', { class: 'lede', text: 'Aggregate exposure, the rules that produce it, and the decisions you owe people.' }),
    tabs,
    body,
  );

  await renderPanel(body, panel, () => void renderGovernanceView(root, panel));
}

async function renderPanel(host: HTMLElement, panel: PanelId, reload: () => void): Promise<void> {
  host.append(el('p', { class: 'muted', text: 'Loading…' }));
  try {
    switch (panel) {
      case 'overview':
        return await renderOverview(host);
      case 'rules':
        return await renderRules(host, reload);
      case 'tools':
        return await renderTools(host, reload);
      case 'exceptions':
        return await renderExceptions(host, reload);
      case 'requests':
        return await renderRequests(host, reload);
      case 'changes':
        return await renderChanges(host);
    }
  } catch (error) {
    clear(host).append(
      el('p', { class: 'form-error', text: error instanceof Error ? error.message : 'Loading failed.' }),
    );
  }
}

// ----------------------------------------------------------------- overview

async function renderOverview(host: HTMLElement): Promise<void> {
  const data = await api.monitoring(30);
  clear(host);

  const peak = Math.max(1, ...data.trend.map((point) => point.count));

  host.append(
    section(
      'Exposure in the last 30 days',
      'Counts of decisions. There is no name, no pseudonym and no prompt behind any of these numbers — by construction, not by convention.',
      el(
        'div',
        { class: 'stats' },
        stat('Interactions seen', data.total),
        stat('Blocked', data.byDecision['BLOCK'] ?? 0, 'bad'),
        stat('Made safe', data.byDecision['MAKE_SAFE'] ?? 0, 'warn'),
        stat('Allowed', data.byDecision['ALLOW'] ?? 0, 'ok'),
      ),
      el(
        'div',
        { class: 'sparkline', role: 'img', 'aria-label': 'Daily interaction volume' },
        ...data.trend.map((point) =>
          el('span', {
            class: 'spark-bar',
            style: `height:${Math.round((point.count / peak) * 100)}%`,
            title: `${point.day}: ${point.count}`,
          }),
        ),
      ),
    ),
    section(
      'Which tools, which rules',
      null,
      el(
        'div',
        { class: 'two-up' },
        el(
          'div',
          {},
          el('h3', { text: 'By tool' }),
          table(
            ['Tool', 'Interactions'],
            Object.entries(data.byTool)
              .sort((a, b) => b[1] - a[1])
              .map(([tool, count]) => [tool, String(count)]),
          ),
        ),
        el(
          'div',
          {},
          el('h3', { text: 'By rule' }),
          table(
            ['Rule', 'Times fired'],
            Object.entries(data.byPolicy)
              .sort((a, b) => b[1] - a[1])
              .map(([policy, count]) => [policy, String(count)]),
          ),
        ),
      ),
    ),
    section(
      'Tools nobody assessed',
      'Unregistered tools people tried to use. This is the list that tells you where policy and reality have parted company.',
      table(
        ['Tool', 'Attempts'],
        data.shadowIt.map((entry) => [entry.toolId, String(entry.attempts)]),
      ),
      Object.keys(data.shadowOutcomes).length > 0
        ? el('p', {
            class: 'muted small',
            text: `Shadow-mode rules would additionally have produced: ${Object.entries(data.shadowOutcomes)
              .map(([policy, count]) => `${policy} ×${count}`)
              .join(', ')}.`,
          })
        : null,
    ),
  );
}

function stat(label: string, value: number, tone = 'neutral'): HTMLElement {
  return el(
    'div',
    { class: `stat stat-${tone}` },
    el('div', { class: 'stat-value', text: String(value) }),
    el('div', { class: 'stat-label', text: label }),
  );
}

// -------------------------------------------------------------------- rules

async function renderRules(host: HTMLElement, reload: () => void): Promise<void> {
  const [catalogue, versions] = await Promise.all([api.catalogue(30), api.policyVersions()]);
  clear(host);

  const draft: Policy[] = structuredClone(catalogue.policies).map(
    ({ hits: _hits, suppressions: _suppressions, ...policy }) => policy,
  );

  const editorHost = el('div');
  const diffHost = el('div');

  const renderCatalogue = (): void => {
    clear(editorHost).append(
      table(
        ['Rule', 'Effect', 'State', 'Fired (30d)', 'Suppressed', ''],
        draft.map((policy, index) => {
          const stats = catalogue.policies.find((entry) => entry.id === policy.id);
          const edit = el('button', { type: 'button', class: 'link', text: 'Edit' });
          edit.addEventListener('click', () => openEditor(index));
          return [
            el(
              'div',
              {},
              el('strong', { text: policy.id }),
              el('div', { text: policy.name }),
              el('div', { class: 'muted small', text: policy.conditions.map(describeCondition).join(' AND ') }),
              !isSuppressible(policy.id) ? badge('cannot be excepted', 'bad') : null,
            ),
            badge(policy.outcome.replace('_', ' '), policy.outcome === 'BLOCK' ? 'bad' : policy.outcome === 'MAKE_SAFE' ? 'warn' : 'ok'),
            policy.state.toLowerCase(),
            String(stats?.hits ?? 0),
            String(stats?.suppressions ?? 0),
            edit,
          ];
        }),
      ),
    );
  };

  const openEditor = (index: number): void => {
    const policy = draft[index];
    if (!policy) return;
    clear(editorHost).append(
      ruleEditor(policy, {
        onCancel: () => renderCatalogue(),
        onApply: (updated) => {
          draft[index] = updated;
          renderCatalogue();
          void refreshDiff();
        },
      }),
    );
  };

  const refreshDiff = async (): Promise<void> => {
    const { diff } = await api.diff(draft);
    clear(diffHost);
    if (diff.length === 0) {
      diffHost.append(el('p', { class: 'muted', text: 'No changes against the active version.' }));
      return;
    }
    diffHost.append(
      table(
        ['Rule', 'Change', 'Before', 'After'],
        diff.map((entry) => [
          entry.policyId,
          badge(entry.kind.toLowerCase(), entry.kind === 'REMOVED' ? 'bad' : entry.kind === 'ADDED' ? 'ok' : 'warn'),
          entry.before ? el('pre', { class: 'rule', text: describePolicy(entry.before) }) : '—',
          entry.after ? el('pre', { class: 'rule', text: describePolicy(entry.after) }) : '—',
        ]),
      ),
      publishForm(draft, reload),
    );
  };

  renderCatalogue();
  await refreshDiff();

  host.append(
    section(
      'Rule catalogue',
      `Active version ${catalogue.version}. Every rule shows what it does, how often it fired and how often an exception suppressed it.`,
      editorHost,
    ),
    section('Pending changes', 'Nothing takes effect until you publish, and publishing states what changed.', diffHost),
    section(
      'Version history',
      'Versions are immutable. A rollback publishes the old rules as a new version rather than deleting the ones in between.',
      table(
        ['Version', 'Published', 'By', 'Reason', 'Rules', ''],
        versions.versions.map((version) => {
          const isActive = version.version === versions.activeVersion;
          const button = el('button', { type: 'button', class: 'link', text: 'Roll back to this' });
          button.addEventListener('click', () => {
            void askForReason(
              `Roll back to ${version.version}`,
              'This publishes the old rules as a new version. Nothing in between is deleted.',
            ).then((reason) => {
              if (!reason) return;
              return api.rollback(version.version, reason).then(reload).catch(reportFailure);
            });
          });
          return [
            el('div', {}, version.version, isActive ? badge('active', 'ok') : null),
            formatDateTime(version.createdAt),
            version.createdBy,
            version.reason,
            String(version.policyCount),
            isActive ? el('span', { class: 'muted small', text: '—' }) : button,
          ];
        }),
      ),
    ),
  );
}

function publishForm(draft: Policy[], reload: () => void): HTMLElement {
  const reason = el('input', { type: 'text', required: true, placeholder: 'What changed and why?' }) as HTMLInputElement;
  const feedback = el('p', { class: 'form-error' });
  const form = el(
    'form',
    { class: 'subsection' },
    field('Reason for this change', reason),
    feedback,
    el('button', { type: 'submit', text: 'Publish new version' }),
  ) as HTMLFormElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    feedback.textContent = '';
    void api
      .publish(draft, reason.value)
      .then(reload)
      .catch((error: unknown) => {
        feedback.textContent = describeFailure(error);
      });
  });

  return form;
}

/**
 * The editor offers exactly the inputs and operators the engine evaluates. There
 * is no free-text expression field, so a rule that the enforcement point cannot
 * run is not something governance can accidentally write.
 */
function ruleEditor(
  policy: Policy,
  handlers: { onCancel: () => void; onApply: (policy: Policy) => void },
): HTMLElement {
  const working: Policy = structuredClone(policy);

  const name = el('input', { type: 'text', value: working.name, required: true }) as HTMLInputElement;
  const rationale = el('textarea', { rows: 2, required: true }) as HTMLTextAreaElement;
  rationale.value = working.rationale;

  const outcome = el(
    'select',
    {},
    ...DECISIONS.map((decision) =>
      el('option', { value: decision, text: decision.replace('_', ' '), selected: decision === working.outcome }),
    ),
  ) as HTMLSelectElement;

  const state = el(
    'select',
    {},
    ...(['ACTIVE', 'SHADOW', 'RETIRED'] as const).map((value) =>
      el('option', { value, text: value.toLowerCase(), selected: value === working.state }),
    ),
  ) as HTMLSelectElement;

  const conditionsHost = el('div', { class: 'conditions' });

  const renderConditions = (): void => {
    clear(conditionsHost);
    working.conditions.forEach((condition, index) => {
      conditionsHost.append(
        conditionRow(condition, (updated) => {
          working.conditions[index] = updated;
          renderConditions();
        }, () => {
          working.conditions.splice(index, 1);
          renderConditions();
        }),
      );
    });
    const add = el('button', { type: 'button', class: 'link', text: '+ Add condition' });
    add.addEventListener('click', () => {
      working.conditions.push({ input: 'classification', operator: 'in', values: ['CONFIDENTIAL'] });
      renderConditions();
    });
    conditionsHost.append(add);
  };

  renderConditions();

  const apply = el('button', { type: 'button', text: 'Apply to draft' });
  apply.addEventListener('click', () => {
    handlers.onApply({
      ...working,
      name: name.value,
      rationale: rationale.value,
      outcome: outcome.value as Policy['outcome'],
      state: state.value as Policy['state'],
    });
  });

  const cancel = el('button', { type: 'button', class: 'link', text: 'Cancel' });
  cancel.addEventListener('click', handlers.onCancel);

  return el(
    'div',
    { class: 'editor' },
    el('h3', { text: `Editing ${working.id}` }),
    field('Name', name),
    field('Effect', outcome),
    field('State', state, 'Shadow rules are evaluated and reported but never enforced.'),
    field('Rationale', rationale, 'Employees see this when the rule stops them.'),
    el('div', { class: 'field-label', text: 'Conditions (all must hold)' }),
    conditionsHost,
    el('div', { class: 'row' }, apply, cancel),
  );
}

function conditionRow(
  condition: Condition,
  onChange: (condition: Condition) => void,
  onRemove: () => void,
): HTMLElement {
  const current = condition as unknown as Record<string, unknown>;
  const input = String(current['input']);

  const inputSelect = el(
    'select',
    {},
    ...POLICY_INPUTS.map((candidate) => el('option', { value: candidate, text: candidate, selected: candidate === input })),
  ) as HTMLSelectElement;

  const operators = SUPPORTED_OPERATORS[input] ?? [];
  const operatorSelect = el(
    'select',
    {},
    ...operators.map((candidate) =>
      el('option', { value: candidate, text: candidate, selected: candidate === current['operator'] }),
    ),
  ) as HTMLSelectElement;

  const domain = VALUE_DOMAINS[input];
  let valueControl: HTMLElement;

  if (domain) {
    const selected = new Set((current['values'] as string[] | undefined) ?? []);
    const list = el(
      'div',
      { class: 'checks' },
      ...domain.map((value) => {
        const box = el('input', { type: 'checkbox', value, checked: selected.has(value) }) as HTMLInputElement;
        box.addEventListener('change', () => {
          if (box.checked) selected.add(value);
          else selected.delete(value);
          onChange({ ...(current as object), values: [...selected] } as Condition);
        });
        return el('label', { class: 'check' }, box, el('span', { text: value.replace(/_/g, ' ').toLowerCase() }));
      }),
    );
    valueControl = list;
  } else if (typeof current['value'] === 'boolean') {
    const box = el('input', { type: 'checkbox', checked: current['value'] === true }) as HTMLInputElement;
    box.addEventListener('change', () => onChange({ ...(current as object), value: box.checked } as Condition));
    valueControl = el('label', { class: 'check' }, box, el('span', { text: 'is true' }));
  } else {
    valueControl = el('span', { class: 'muted small', text: 'No value needed for this operator.' });
  }

  inputSelect.addEventListener('change', () => {
    const next = inputSelect.value;
    const operator = SUPPORTED_OPERATORS[next]?.[0] ?? 'in';
    const values = VALUE_DOMAINS[next] ? { values: [] } : {};
    const value = operator === 'is' ? { value: true } : {};
    onChange({ input: next, operator, ...values, ...value } as unknown as Condition);
  });

  operatorSelect.addEventListener('change', () =>
    onChange({ ...(current as object), operator: operatorSelect.value } as Condition),
  );

  const remove = el('button', { type: 'button', class: 'link danger-link', text: 'Remove' });
  remove.addEventListener('click', onRemove);

  return el('div', { class: 'condition' }, inputSelect, operatorSelect, valueControl, remove);
}

// -------------------------------------------------------------------- tools

async function renderTools(host: HTMLElement, reload: () => void): Promise<void> {
  const registry = await api.registry();
  clear(host);

  const draft: Tool[] = structuredClone(registry.tools);
  const listHost = el('div');
  const feedback = el('div');

  const renderList = (): void => {
    clear(listHost).append(
      table(
        ['Tool', 'Status', 'Hosting', 'Data classes allowed', 'Personal data', 'Trains on our data'],
        draft.map((tool, index) => [
          el('div', {}, el('strong', { text: tool.name }), el('div', { class: 'muted small', text: tool.hosts.join(', ') })),
          selectFor(['APPROVED', 'RESTRICTED', 'NOT_APPROVED'], tool.approvalStatus, (value) => {
            const entry = draft[index];
            if (entry) entry.approvalStatus = value as Tool['approvalStatus'];
          }),
          selectFor(['CH', 'EU', 'OTHER'], tool.hostingRegion, (value) => {
            const entry = draft[index];
            if (entry) entry.hostingRegion = value as Tool['hostingRegion'];
          }),
          el(
            'div',
            { class: 'checks' },
            ...CLASSIFICATIONS.map((classification) => {
              const box = el('input', {
                type: 'checkbox',
                checked: tool.allowedData.includes(classification),
              }) as HTMLInputElement;
              box.addEventListener('change', () => {
                const entry = draft[index];
                if (!entry) return;
                entry.allowedData = box.checked
                  ? [...entry.allowedData, classification]
                  : entry.allowedData.filter((value) => value !== classification);
              });
              return el('label', { class: 'check' }, box, el('span', { text: classification.replace(/_/g, ' ').toLowerCase() }));
            }),
          ),
          checkboxFor(tool.permitsPersonalData, (value) => {
            const entry = draft[index];
            if (entry) entry.permitsPersonalData = value;
          }),
          checkboxFor(tool.trainsOnCustomerData, (value) => {
            const entry = draft[index];
            if (entry) entry.trainsOnCustomerData = value;
          }),
        ]),
      ),
    );
  };

  renderList();

  const reason = el('input', { type: 'text', required: true, placeholder: 'What changed and why?' }) as HTMLInputElement;
  const form = el(
    'form',
    { class: 'subsection' },
    field('Reason for this change', reason),
    feedback,
    el('button', { type: 'submit', text: 'Publish registry' }),
  ) as HTMLFormElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clear(feedback);
    void api
      .publishRegistry(draft, reason.value)
      .then((result) => {
        if (result.exceptionsToReview.length === 0) {
          reload();
          return;
        }
        // Narrowing what a tool may take can leave an exception granting access
        // to something the tool is no longer allowed to receive. Saying so is
        // the difference between a registry edit and a silent policy change.
        feedback.append(
          el('p', {
            class: 'form-warning',
            text: `Published. These exceptions relied on data classes you just removed and need review: ${result.exceptionsToReview.join(', ')}.`,
          }),
        );
      })
      .catch((error: unknown) => {
        feedback.append(el('p', { class: 'form-error', text: describeFailure(error) }));
      });
  });

  host.append(
    section(
      'Tool registry',
      `Active version ${registry.version}. A tool that is not here is shadow IT, and the rules treat it that way.`,
      listHost,
      form,
    ),
  );
}

function selectFor(options: readonly string[], current: string, onChange: (value: string) => void): HTMLElement {
  const select = el(
    'select',
    {},
    ...options.map((option) =>
      el('option', { value: option, text: option.replace(/_/g, ' ').toLowerCase(), selected: option === current }),
    ),
  ) as HTMLSelectElement;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function checkboxFor(current: boolean, onChange: (value: boolean) => void): HTMLElement {
  const box = el('input', { type: 'checkbox', checked: current }) as HTMLInputElement;
  box.addEventListener('change', () => onChange(box.checked));
  return el('label', { class: 'check' }, box);
}

// --------------------------------------------------------------- exceptions

async function renderExceptions(host: HTMLElement, reload: () => void): Promise<void> {
  const [data, registry, catalogue] = await Promise.all([api.exceptions(), api.registry(), api.catalogue(30)]);
  clear(host);

  const rows = data.exceptions.map((exception) => {
    const revoke = el('button', { type: 'button', class: 'link danger-link', text: 'Revoke' });
    revoke.addEventListener('click', () => {
      void askForReason(
        `Revoke ${exception.id}`,
        'The person this applies to will see that it ended, and why.',
      ).then((reason) => {
        if (!reason) return;
        return api.revokeException(exception.id, reason).then(reload).catch(reportFailure);
      });
    });

    return [
      el('div', {}, el('strong', { text: exception.id }), exception.expiringSoon ? badge('expires soon', 'warn') : null),
      `${exception.subject.kind.toLowerCase()} ${exception.subject.id}`,
      `${exception.scope.toolId} · ${exception.scope.classifications.map((value) => value.toLowerCase()).join(', ')}`,
      exception.suppressedPolicyIds.join(', '),
      exception.justification,
      formatDate(exception.expiresAt),
      exception.revokedAt
        ? badge('revoked', 'bad')
        : exception.active
          ? revoke
          : badge('expired', 'neutral'),
    ];
  });

  host.append(
    section(
      'Exceptions',
      'Every exception names who, for which tool and data class, which rule it suppresses, why, and when it ends.',
      table(['Reference', 'Subject', 'Scope', 'Suppresses', 'Justification', 'Expires', ''], rows),
      data.exceptions.some((exception) => exception.expiringSoon)
        ? el('p', {
            class: 'form-warning',
            text: `Exceptions expiring within ${data.warningDays} days are marked. Expiry is the default, not an incident.`,
          })
        : null,
    ),
    exceptionForm(registry.tools, catalogue.policies, reload),
  );
}

function exceptionForm(tools: Tool[], policies: Policy[], reload: () => void): HTMLElement {
  const subjectKind = el(
    'select',
    {},
    el('option', { value: 'USER', text: 'a person' }),
    el('option', { value: 'GROUP', text: 'a group' }),
  ) as HTMLSelectElement;
  const subjectId = el('input', { type: 'text', required: true, placeholder: 'u-luca or client-advisory' }) as HTMLInputElement;
  const tool = el(
    'select',
    {},
    ...tools.map((entry) => el('option', { value: entry.id, text: entry.name })),
  ) as HTMLSelectElement;

  const classificationBoxes = CLASSIFICATIONS.map((classification) => {
    const box = el('input', { type: 'checkbox', value: classification }) as HTMLInputElement;
    return { classification, box, node: el('label', { class: 'check' }, box, el('span', { text: classification.replace(/_/g, ' ').toLowerCase() })) };
  });

  const policyBoxes = policies.map((policy) => {
    const suppressible = isSuppressible(policy.id);
    const box = el('input', { type: 'checkbox', value: policy.id, disabled: !suppressible }) as HTMLInputElement;
    return {
      policy,
      box,
      node: el(
        'label',
        { class: suppressible ? 'check' : 'check check-disabled' },
        box,
        el('span', { text: `${policy.id} — ${policy.name}` }),
        !suppressible ? badge('cannot be excepted', 'bad') : null,
      ),
    };
  });

  const justification = el('textarea', { rows: 3, required: true }) as HTMLTextAreaElement;
  const expiresAt = el('input', { type: 'date', required: true }) as HTMLInputElement;
  const feedback = el('div');

  const form = el(
    'form',
    {},
    field('Grant to', el('div', { class: 'row' }, subjectKind, subjectId)),
    field('Tool', tool),
    el('div', { class: 'field-label', text: 'Data classifications' }),
    el('div', { class: 'checks' }, ...classificationBoxes.map((entry) => entry.node)),
    el('div', { class: 'field-label', text: 'Rules to suppress' }),
    el('div', { class: 'checks checks-stacked' }, ...policyBoxes.map((entry) => entry.node)),
    el('p', {
      class: 'muted small',
      text: `${NON_SUPPRESSIBLE_POLICY_IDS.join(' and ')} cannot be suppressed by anyone. That is a property of the system, not a setting.`,
    }),
    field('Justification', justification, 'This is read by the person it applies to and by the next auditor.'),
    field('Expires on', expiresAt, 'At most 90 days. There is no permanent exception.'),
    feedback,
    el('button', { type: 'submit', text: 'Grant exception' }),
  ) as HTMLFormElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clear(feedback);
    void api
      .grantException({
        subject: { kind: subjectKind.value as 'USER' | 'GROUP', id: subjectId.value },
        scope: {
          toolId: tool.value,
          classifications: classificationBoxes.filter((entry) => entry.box.checked).map((entry) => entry.classification),
        },
        suppressedPolicyIds: policyBoxes.filter((entry) => entry.box.checked).map((entry) => entry.policy.id),
        justification: justification.value,
        expiresAt: endOfDay(expiresAt.value),
      })
      .then(reload)
      .catch((error: unknown) => {
        const messages = error instanceof ApiFailure ? error.errors : [];
        feedback.append(
          ...(messages.length > 0
            ? messages.map((entry) => el('p', { class: 'form-error', text: entry.message }))
            : [el('p', { class: 'form-error', text: describeFailure(error) })]),
        );
      });
  });

  return section('Grant an exception', null, form);
}

// ----------------------------------------------------------------- requests

async function renderRequests(host: HTMLElement, reload: () => void): Promise<void> {
  const [queue, session] = await Promise.all([api.queue(), api.session()]);
  clear(host);

  const isOpen = (state: string): boolean => state === 'SUBMITTED' || state === 'INFORMATION_REQUESTED';
  const open = queue.requests.filter((request) => isOpen(request.state));
  const decided = queue.requests.filter((request) => !isOpen(request.state));

  const rows = open.map((request) => {
    const isOwn = request.requesterId === session.identity.id;
    return [
      el(
        'div',
        {},
        el('strong', { text: request.toolLabel }),
        el('div', { class: 'muted small', text: request.classification.replace(/_/g, ' ').toLowerCase() }),
        !request.toolRegistered
          ? badge('not in registry', 'bad')
          : !request.toolApprovable
            ? badge('not approved', 'bad')
            : null,
      ),
      request.requesterName,
      request.blockingPolicyIds.join(', '),
      request.justification,
      el('div', {}, `${request.ageDays} day(s)`, badge(request.state.replace('_', ' ').toLowerCase(), 'warn')),
      isOwn
        ? el('span', { class: 'muted small', text: 'Your own request — somebody else decides it.' })
        : decisionControls(request.id, request.toolApprovable, request.toolRegistered, reload),
    ];
  });

  host.append(
    queue.recurring.length > 0
      ? section(
          'A pattern, not an incident',
          'The same need has come up more than once. That usually means the rule or the tooling is wrong, not the people.',
          table(
            ['Scope', 'Open requests'],
            queue.recurring.map((entry) => [
              `${entry.toolLabel} · ${entry.classification.replace(/_/g, ' ').toLowerCase()}`,
              String(entry.requestIds.length),
            ]),
          ),
        )
      : el('div'),
    section(
      'Open requests',
      'Somebody was stopped and told you why they need it. A rejection without a reason is not an option here.',
      table(['Scope', 'Requester', 'Blocked by', 'Justification', 'Age', 'Decision'], rows),
    ),
    section(
      'Decided',
      null,
      table(
        ['Scope', 'Requester', 'Outcome', 'Reason given', 'Grant'],
        decided.map((request) => {
          const last = request.transitions.at(-1);
          return [
            `${request.toolLabel} · ${request.classification.replace(/_/g, ' ').toLowerCase()}`,
            request.requesterName,
            badge(request.state.toLowerCase(), request.state === 'APPROVED' ? 'ok' : 'bad'),
            last?.reason ?? '—',
            request.resultingExceptionId ?? '—',
          ];
        }),
      ),
    ),
  );
}

function decisionControls(
  requestId: string,
  approvable: boolean,
  registered: boolean,
  reload: () => void,
): HTMLElement {
  const reason = el('textarea', { rows: 2, placeholder: 'Reason (the requester reads this)' }) as HTMLTextAreaElement;
  const expiresAt = el('input', { type: 'date' }) as HTMLInputElement;
  const feedback = el('div');

  const send = (decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFORMATION'): void => {
    clear(feedback);
    void api
      .decide(requestId, {
        decision,
        reason: reason.value,
        ...(decision === 'APPROVE' && expiresAt.value
          ? { expiresAt: endOfDay(expiresAt.value) }
          : {}),
      })
      .then(reload)
      .catch((error: unknown) => {
        feedback.append(el('p', { class: 'form-error', text: describeFailure(error) }));
      });
  };

  const blockedReason = !registered
    ? 'This tool is not in the registry. Assess and register it first — approving here would grant access to something nobody has looked at.'
    : 'This tool is registered but not approved for Finnova use. Change its status after an assessment; a personal exception cannot stand in for one.';

  const approve = el('button', {
    type: 'button',
    text: 'Approve',
    disabled: !approvable,
    title: approvable ? '' : blockedReason,
  });
  approve.addEventListener('click', () => send('APPROVE'));

  const reject = el('button', { type: 'button', class: 'danger', text: 'Reject' });
  reject.addEventListener('click', () => send('REJECT'));

  const askMore = el('button', { type: 'button', class: 'link', text: 'Ask for more' });
  askMore.addEventListener('click', () => send('REQUEST_INFORMATION'));

  return el(
    'div',
    { class: 'decision' },
    reason,
    field('Grant until', expiresAt),
    el('div', { class: 'row' }, approve, reject, askMore),
    !approvable ? el('p', { class: 'muted small', text: blockedReason }) : null,
    feedback,
  );
}

// ---------------------------------------------------------------- changes

async function renderChanges(host: HTMLElement): Promise<void> {
  const { records } = await api.records();
  clear(host);

  host.append(
    section(
      'Change log',
      'Who changed what, when, and why. Separate from the audit log, because these are decisions about the system rather than observations of people.',
      table(
        ['When', 'Who', 'Action', 'Target', 'Reason'],
        records.map((record) => [
          formatDateTime(record.at),
          record.actorName,
          badge(
            record.action.replace(/_/g, ' ').toLowerCase(),
            record.action.includes('ATTEMPT') ? 'bad' : record.action.includes('GRANTED') ? 'warn' : 'neutral',
          ),
          `${record.targetType} ${record.targetId}`,
          record.reason ?? '—',
        ]),
      ),
    ),
  );
}

// ------------------------------------------------------------------ helpers

function describeFailure(error: unknown): string {
  if (error instanceof ApiFailure) {
    return error.errors.map((entry) => entry.message).join(' ') || `Rejected with status ${error.status}.`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function reportFailure(error: unknown): void {
  window.alert(describeFailure(error));
}

export type { Classification };
