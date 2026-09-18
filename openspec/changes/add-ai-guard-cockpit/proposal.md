## Why

AI Guard enforces governance in the browser, but it has no control surface. Rules
can only be changed by shipping code, nobody can see why a decision was made
except in the moment it happens, and a blocked employee has no route forward
other than asking someone. Three consequences follow:

- Governance cannot react. A false-positive rule that blocks a whole department
  stays broken until the next release.
- Employees cannot self-serve. The hackathon challenge asks how someone knows
  within two minutes whether AI may be used; today they still have to ask.
- The only lever governance has is the rule itself. Without scoped exceptions,
  every individual case forces a choice between "blocked forever" and "relaxed
  for everyone".

The cockpit closes the loop: a block produces a request, a request produces a
governance decision, and the decision changes what the enforcement layer does
next time.

## What Changes

- **New** AI Guard Cockpit application with two role-based views in one app.
- **New** governance view: policy catalogue, versioned rule editing with
  rollback, tool registry administration, aggregate monitoring, scoped
  exceptions, and an access-request queue.
- **New** employee view: own AI usage history, own effective permissions
  ("what may I use for which data?"), own exceptions, own request status.
- **New** access-request object, pre-filled from the intervention that blocked
  the employee.
- **BREAKING** decision model: an active exception suppresses the policy IDs it
  names before precedence is evaluated (PRD Section 8). Enforcement points must
  fetch and honour exceptions; a build that ignores them is no longer correct.
- **BREAKING** privacy model: the PRD previously stated that no per-user view
  exists. The employee view is a per-user view — but only for the employee
  themselves, and only from browser-local storage. The server-side audit log
  stays pseudonymous and aggregate-only. See `design.md`.
- **Supersedes** the v0.2 decision that access requests belong to the separate
  Finnova AI Cockpit product (PRD Section 25). Requests arise from an
  enforcement decision and are meaningless without it.

## Capabilities

### New Capabilities

- `cockpit/shell`: application shell, identity-driven view selection, and
  server-side authorisation of every governance write.
- `cockpit/policy-administration`: viewing, editing, versioning, publishing,
  rolling back policies and the tool registry, and distributing them to
  enforcement points.
- `cockpit/exceptions`: scoped, time-limited, attributable suppression of named
  policies — including the policies that can never be suppressed.
- `cockpit/access-requests`: employee request intake from an intervention,
  governance decisioning, and the entitlement that results.
- `cockpit/employee-view`: the employee's own usage history, effective
  permissions and request status, under a local-only storage model.

### Modified Capabilities

None. AI Guard has no specs under `openspec/specs/` yet; the enforcement
behaviour described in the PRD (FR-01 to FR-14) has not been captured as
OpenSpec capabilities. Retro-specifying it is deliberately out of scope here —
see "Impact".

## Impact

- **Browser extension**: must fetch exceptions and entitlements for the signed-in
  user, honour policy versions from the distribution endpoint, write the local
  usage history, and deep-link into the cockpit from an intervention.
- **Policy service**: gains write endpoints, versioning, rollback, an exception
  store and a request store. Previously read-only from the extension's view.
- **Audit log**: unchanged in shape, but events gain a `suppressed_policies`
  field so a suppressed rule is still traceable.
- **New identity dependency**: the governance group must exist in the identity
  provider. The cockpit reads group membership; it never manages it.
- **PRD**: Section 14 describes the cockpit at product level and links here.
  Requirement text lives in these specs, not in the PRD, to avoid two sources
  of truth.
- **Not touched**: detection patterns, sanitisation, re-identification, and the
  three-outcome decision model itself.
