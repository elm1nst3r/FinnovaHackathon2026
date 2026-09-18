## Context

AI Guard today is an enforcement point with a read-only policy service behind it.
Adding a cockpit changes three things structurally: the policy service gains
writes, the enforcement point gains per-user inputs (exceptions and
entitlements), and the product gains a per-user view — which the PRD's privacy
model explicitly ruled out in v0.2.

The binding constraints are the ones already in the PRD: prompts are never
stored, detection stays in the browser, audit events are pseudonymous, and
aggregate reporting must not become behaviour monitoring under Art. 26 ArGV 3.
The cockpit has to be designed around those, not despite them.

The hackathon constraint matters too: the product is the enforcement layer. A
cockpit that consumes the build time and leaves the interception half-working
loses the pitch.

## Goals / Non-Goals

**Goals:**

- Give governance a safe way to change rules: versioned, diffable, reversible.
- Give employees a truthful answer to "what may I use" and "why was I blocked",
  without asking anyone.
- Close the loop from block to request to decision to changed enforcement.
- Keep the "employees are not monitored" promise literally true, not merely
  policy-enforced.
- Keep the cockpit small enough that it does not become the project.

**Non-Goals:**

- Identity and access management. Group membership is read, never written.
- A workflow engine. One approver, four states, no routing rules.
- A rule scripting language.
- Any per-user usage view for anyone other than the user themselves.
- Retro-specifying the existing enforcement behaviour (FR-01 to FR-14).

## Decisions

### Three stores, three purposes

The Employee view needs a per-user history; the privacy model forbids a per-user
server-side log. Both hold if the data is kept in three separate places with
different owners.

| | Audit log | Personal history | Governance records |
|---|---|---|---|
| Purpose | Governance evidence, aggregates | Transparency for the individual | Access management and attribution |
| Location | Server | The employee's browser | Server |
| Names the user | No, pseudonymous ID | Yes, to that user on that device | Yes |
| Readable by governance | Aggregated only | Never | Yes |
| Contents | Decision metadata | Decision metadata | Exceptions, requests, policy changes |
| Retention | Per governance policy | Bounded window, user can clear | Until expiry plus audit period |

The personal history stays in the browser. The server therefore never holds an
identifiable record of who prompted what and when — not as a matter of access
control that could be reconfigured, but because the record does not exist.

Alternative considered: a server-side personal history readable only by its
subject. Rejected. It puts the data within the employer's technical reach and
makes the monitoring promise a configuration setting rather than an
architectural property. The cost of the chosen approach is that history is
per-device and disappears when browser storage is cleared. That trade is the
right way round, and it has a pleasant second-order effect: a data subject
access request has a simple, honest answer.

### Exceptions and entitlements are identified — and that is not monitoring

An exception names the employee. So does a request. These are access-management
records: the documented result of something a person asked for and an approver
granted, comparable to any other access right in the bank. Behaviour logging is
a different thing with a different purpose, and the two are kept in different
stores so that the distinction cannot quietly erode.

A consequence: the enforcement point must fetch "my exceptions", which
identifies the user to the policy service. That read must not be turned into a
usage log — the service logs it only as far as operations require.

### An exception suppresses named policies; it does not downgrade outcomes

Two models were considered. Downgrading the outcome by one step (`BLOCK` to
`MAKE_SAFE`) is compact but opaque: the audit trail cannot say which rule was
actually set aside. Suppressing named policy IDs composes predictably — the
remaining rules still run, precedence is re-evaluated normally, and the event can
state exactly what was suppressed under which exception.

### Two policies can never be suppressed

`CH-AI-CRED-01` and `CH-AI-CONF-02` are rejected server-side, not hidden in the
UI. Without this, the cockpit becomes a self-service route around the single
most important control in the product: an approver under time pressure grants a
"temporary" credential exception, and the enforcement layer stops being an
enforcement layer.

### One application, two views

Selected by identity group. Tool owners get the governance view filtered to
their tool rather than a third view — a third view would add access-control
surface without adding information.

Authorisation is enforced on the server for every write. Hiding a button is not
authorisation; a governance write endpoint that trusts the UI is a broken access
control finding waiting to happen.

### Where the employee view gets its history

This is the one place where "browser-local history" and "one web application"
pull against each other: a web page cannot read extension storage directly.

Chosen: the extension injects the history into the cockpit page on Finnova's own
first-party origin, via a content script restricted to that origin. One product,
one URL, and the data still never leaves the device.

Alternative considered: render the employee view inside the extension as its own
page. Simpler, no bridge, no origin to get wrong — but it splits the product into
two user interfaces and makes "open the cockpit" mean two different things
depending on which half you want. If the bridge turns out to cost more than an
hour during the build, take the alternative; it is a worse product but not a
worse privacy position.

Whichever is chosen, the content script must accept messages only from the
cockpit origin and must never expose the history to any other page.

### Structured rule editor, no expressions

Rules are composed from the fixed condition set in the PRD's policy-inputs table.
Free-form expressions would give the cockpit an evaluation surface that is hard
to review, hard to diff meaningfully, and attractive to anyone looking for a way
to make the enforcement layer execute something.

### Policy distribution: versioned pull, cache, last known good

Enforcement points pull the active policy set and registry and cache them. On an
unreachable policy service they keep enforcing the cached version — neither
failing open (governance silently stops) nor failing shut (nobody can work).
Cache age is surfaced to the user rather than hidden.

### AI Guard owns access requests

This supersedes the v0.2 split that assigned requests to the separate Finnova AI
Cockpit. A request originates in an enforcement decision, carries that decision
as its context, and results in an object the enforcement layer consumes. Where
the other product exists, AI Guard hands over the approved outcome rather than
running a second approval workflow.

### Deliberately deferred

Four-eyes approval of policy changes, staged rollout by population, shadow mode,
replay of a candidate rule against historical events, email or chat
notifications, and renewal reminders. Each is defensible in production; none is
needed to show that the loop closes.

## Risks / Trade-offs

- **The cockpit eats the hackathon.** The enforcement demo is the product. The
  task list is ordered so that the two views reach a demonstrable state early and
  everything after that is optional.
- **Exception sprawl.** Scoped, expiring exceptions are easier to grant than to
  review. Mandatory expiry bounds the damage; recurring requests for the same
  scope are surfaced as a signal that the rule, not the people, is wrong.
- **Local history is weak for the employee.** It cannot be used to prove anything
  to anyone, and it vanishes with browser storage. Accepted: it exists to answer
  "what happened to my prompt", not to serve as evidence.
- **Stale policy cache.** An enforcement point that has been offline for a long
  time enforces old rules, including rules governance has since rolled back.
  Staleness is surfaced; hard thresholds are a production concern.
- **A per-user view invites scope creep toward a manager view.** Every such
  request should be refused on the grounds in `cockpit/employee-view`. The
  architecture makes refusal easy — the data is not there.
- **Demo dependency on a live service.** If the policy service is unavailable
  during the pitch, the extension must still demonstrate enforcement from cache.
  This is a real scenario, not only a resilience nicety.
