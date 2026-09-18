# Audit: implementation on `main` vs this change

Date: 2026-09-18. Audited commit: `a667204`. Read-only audit; nothing in `src/` was changed.

## Status after the fix pass (same day)

Applied on top of `a667204`, uncommitted. `npx tsc --noEmit` clean, `npm test` 80/80 (was 72),
`npm run build:web` produces both bundles, `openspec validate --strict` passes.

Fixed:

- Fix 1, page-title leak: `toolLabel` removed from the decide message; unregistered hosts are
  labelled by hostname (`src/extension/background.ts`, `guard.ts`).
- Fix 2, outage flag: persisted in storage next to the snapshot, so a restarted worker still
  reports "using cache"; decisions retry the fetch while on cache so recovery is immediate
  (`src/extension/sync.ts`). Tested.
- Fix 3, no-cache fail-open: the guard now holds the prompt and shows a sheet when there is no
  decision to apply (`guard.ts` `showHold`).
- Manual request form resolves a registered tool by id; free text only for unknown tools
  (`employee.ts`).
- RESTRICTED mismatch: queue `toolApprovable` now matches the grant. Tested.
- Refused approval: reason is appended to the request as an attributed note, visible to the
  requester (`store.annotateRequest`, `routes.ts`). Tested.
- Approved request row shows granted tool and classifications, not only expiry.
- Expiry day: the permissions reason no longer formats a date server-side; the employee view
  appends `until <day>` with the same formatter as the exceptions list.
- 90-day edge accepts the end of day 90. Tested.
- Stranded check flags exceptions on a tool removed from the registry. Tested.
- `recurringScopes` normalises free-text labels. Tested.
- History prune is written back on read. Tested.
- Shadow outcomes now travel from the worker to the audit ingest, allow-listed, and reach
  monitoring. Tested. Task 9.1 is therefore closer but still open: the cockpit does not yet
  count shadow outcomes separately per rule in the catalogue.
- `demo-history.ts` shares the history key constant.
- `shell` spec: attribution scenario now says records may include refused or unauthorised
  attempts.

Still open (need a design decision or more than a small change): per-policy version history,
"add tool" control plus registry POST validation, a route for the requester to answer
`INFORMATION_REQUESTED`, cockpit 401 handling, persisted stranded-exception review, resolving
a historical policy version to its rule text, the static pseudonym question, and the bridge
origin note. The original findings below are kept as written for traceability.

## Verdict

The build is honest about its state. Typecheck is clean, `npm test` is 72/72, `npm run build:web`
produces both bundles, `openspec validate --strict` passes, and the only open tasks outside
section 9 are the two manual rehearsals (8.1, 8.2). The server-side security model holds:
unauthenticated calls get 401, forged governance writes get 403 and are recorded, the audit
ingest rebuilds events from an allow-list so prompt text and detected values sent by a client are
dropped, and the two non-suppressible policies are refused server-side including the mixed case.

Three findings should be fixed before 8.1/8.2 are rehearsed, because they touch the privacy
promise and the resilience claim the demo is built on. Everything else is a spec gap or a
polish item and can follow.

## Fix before rehearsal

1. **Page title leaks into local history on unregistered hosts.** `guard.ts` sends
   `document.title` as `toolLabel`; `src/extension/background.ts:115` and `:125` store it when the
   host is not in the registry. The manifest injects the guard on `chat.deepseek.com` and
   `www.perplexity.ai`, neither of which is in the seed registry. Perplexity sets the title to the
   query; DeepSeek to an LLM-generated conversation title. A `BLOCK` there writes prompt-derived
   text into `aig.history` and shows it in the cockpit. Server-bound paths are safe (hostname
   only). Fix: send `location.hostname` as the label, or drop `toolLabel` from the message.
   Violates spec `employee-view` / History Content Limits, and task 3.6 / 8.4.

2. **Staleness is never surfaced during an outage until the cache is 24h old.**
   `src/extension/background.ts:21-23` constructs a new `PolicySync` per message, so
   `#usingCache` and `#lastError` (`sync.ts:44-45`) are lost immediately and `describeStaleness`
   returns null until `STALE_AFTER_HOURS`. Spec `policy-administration` / Policy service
   unreachable requires the cache age to be surfaced. This is exactly what 8.2 demonstrates.
   Fix: keep one `PolicySync` per identity in the worker, or persist the last-error flag in
   storage next to the snapshot.

3. **Guard fails open when no decision comes back.** `src/extension/guard.ts:371`:
   `if (!reply.result || ...ALLOW)` resends the prompt. `result` is null when there is no cached
   snapshot at all (first run with the service down, or storage cleared). The spec's "neither
   fail-open nor fail-shut" covers the cached case, which works and is tested, but the no-cache
   case should at least block with an explanation rather than silently allow.

## Spec gaps (implemented differently or not at all)

| Spec | Requirement / scenario | Gap | Where |
|---|---|---|---|
| access-requests | Approval requiring an unapprovable suppression: reason shown to *both* parties | 422 returned to approver only; request untouched, requester never sees why | `src/service/routes.ts:546` |
| access-requests | Request lifecycle, `INFORMATION_REQUESTED` | State exists and core allows `→ SUBMITTED`, but no route or UI lets the requester respond. Dead end. | `src/core/requests.ts:93`, routes |
| employee-view | Approved request shows granted scope and expiry | API returns tool + classifications; UI renders only `Granted until <date> (EX-id)` | `src/cockpit/views/employee.ts:158-159` |
| exceptions | Expiry shown consistently | Permissions reason uses `expiresAt.slice(0,10)` (UTC, ISO); all other views format locally (dd.mm.yyyy). Wrong day west of UTC. | `src/core/permissions.ts:87` |
| policy-administration | Rule detail: version history per policy with actor and timestamp | Only policy-set history exists | `src/cockpit/views/governance.ts:252-281` |
| policy-administration | Historical decision stays interpretable | Version id is stored on events, but no API route or UI resolves an old version to its rule text | `store.policySet()` only in-process |
| policy-administration | Tool registry administration: add a tool | UI can edit status, attributes, data classes, but has no "add tool" control. POST accepts an unvalidated `Tool[]` cast. | `src/service/routes.ts:289`, `governance.ts:463-560` |
| policy-administration | Narrowed data class flags dependent exceptions for review | Computed server-side but surfaced as a one-shot toast; not persisted, not in the governance record | `routes.ts:295-309`, `governance.ts:533-545` |
| policy-administration | Shadow Mode (Post-MVP, task 9.1 unchecked) | Engine evaluates SHADOW rules and the editor offers the state, but `routes.ts:172` hardcodes `shadowOutcomes: []` and the worker never sends them. Monitoring's shadow panel is always zero. Consistent with 9.1 being open, but the delta spec would be synced as delivered behaviour. See "Before sync". | `src/service/routes.ts:172`, `background.ts:155-165` |
| shell | Unauthenticated access: user is sent to authentication | Server returns 401 with no data. Cockpit has no 401 handling; identity is a mocked header defaulting to `u-anna`. Acceptable under the mocked-identity decision. | `src/cockpit/api.ts:39` |
| shell | Attribution records contain only governance actors | `UNAUTHORISED_ATTEMPT` and `REJECTED_ATTEMPT` records name non-governance actors. Defensible (they are security events, not usage), but the spec text says otherwise. Amend the spec or move attempts to their own store. | `src/service/http.ts:198-209`, `store.ts:282-295` |

## Bugs (not spec gaps)

- **RESTRICTED tools:** queue marks them approvable (`routes.ts:443`, `!== 'NOT_APPROVED'`) but the
  grant passes `approved: status === 'APPROVED'` (`store.ts:277`), so Approve is enabled and then
  refused. Latent: no seed tool is RESTRICTED.
- **Manual request form always sends `toolId: null`** and `CH-AI-TOOL-01`, even when the employee
  types a registered tool's name. Approval then always fails with TOOL_NOT_REGISTERED
  (`employee.ts:205-212`). Resolve the label against the registry before sending.
- **90-day edge:** end-of-day plus `> MAX_EXCEPTION_DAYS * DAY_MS` rejects a date exactly 90 days
  out; the form says "At most 90 days" (`exceptions.ts:182`, `governance.ts:682`).
- **Stranded-exception check skips tools removed from the registry** (`routes.ts:301`, `!after → false`).
- **`recurringScopes` keys unregistered tools by free-text label**, so "DeepSeek" and "deepseek"
  don't group (`requests.ts:124`).
- Prune on read is not persisted; aged entries stay on disk until the next append (`history.ts:40-46`). Minor.
- `demo-history.ts:74` writes the `'aig.history'` key literal instead of sharing the constant.

## Privacy notes for the team

- The substantive invariant holds: prompt text is a parameter only in `guard.ts` and `detect.ts`;
  `DecisionResult` has no `detectedCategories`; the audit ingest and the request creation both
  rebuild from allow-lists. The design's literal claim that a grep for "prompt" hits only three
  files is false (comments elsewhere), but nothing substantive.
- **Pseudonyms are static and server-resident.** `pseudonymId` is a fixed field of the identity
  directory (`seed.ts:162-177`) stamped on every audit event. Anyone with directory read can join
  events to people. Audit events also carry `exceptionIds`, and `EX-101` is user-scoped, so an
  event naming it identifies Luca regardless of pseudonym. No route exposes rows today, so this is
  latent. The spec's "by design rather than by access control" is true of the routes, not the store.
  Worth a decision before the pitch claims it.
- **Bridge trust boundary is the origin, not the cockpit.** `bridge.js` is injected on all of
  `localhost:8787` and `127.0.0.1:8787`; any page on that origin can read or clear the history.
  Fine for the demo, worth a sentence in the design.

## Test coverage gaps

No tests for: registry publish (`POST /api/governance/registry`), the revoke route,
`/api/my/exceptions`, queue columns, `expiringSoon` at API level, governance record *contents*
(publish record fields, rollback record fields), zero hit-count on a never-fired policy, the
refused-approval path, and anything in the cockpit DOM or the bridge. Browser-only code
(`guard.ts`, `bridge.ts`, `history-bridge.ts`, both views) is untested by design.

## Task list accuracy

Tasks 1 to 7 are all checked and all substantively present. Three checked tasks are weaker than
their wording:

- **3.6 / 8.4** (no prompt content reaches history / screens): false on unregistered hosts, see fix 1.
- **4.6** (tool registry editor): edit only, no add.
- **7.3** (surface cache age past threshold): the threshold works, the outage flag does not, see fix 2.

## Before sync and archive

The design already says not to sync yet because Shadow Mode would land in `openspec/specs/` as
delivered behaviour. Two more items should be resolved or the delta specs amended first:

1. `policy-administration` Shadow Mode: either wire `shadowOutcomes` end to end (small: send them
   from the worker, accept them in `postAuditEvent`) or move the requirement out of this change.
2. `shell` "only governance actors" wording vs the attempt records that are written today.

## Suggested order for the apply session

1. Fix 1 (toolLabel), fix 2 (staleness flag), fix 3 (no-cache fail-open). Add a test for each of
   the first two; they are Node-testable.
2. Manual-request form tool resolution and the RESTRICTED mismatch, since both break the
   request-to-exception loop that 8.1 demonstrates.
3. Rehearse 8.1 and 8.2.
4. Then the spec gaps in the table, in the order the team cares about, and the spec amendments.
5. Then sync and archive.
