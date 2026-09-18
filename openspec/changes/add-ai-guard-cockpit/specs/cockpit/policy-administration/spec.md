## Purpose

Governance owns the rules that the enforcement layer applies. This capability
covers seeing the rule catalogue, changing it safely, undoing a change that
turns out to be wrong, and getting the result to every enforcement point.

## ADDED Requirements

### Requirement: Policy Catalogue Visibility

The cockpit SHALL show every policy with its ID, human-readable name, outcome,
lifecycle state, active version, and how often it fired in a selectable period.
The catalogue SHALL be readable by governance members without any write
capability being exercised.

**Priority:** MVP

#### Scenario: Catalogue listing

- **WHEN** a governance member opens the policy catalogue
- **THEN** all policies are listed with ID, outcome, state, active version and hit count
- **AND** a policy that has never fired is shown with a zero count rather than omitted

#### Scenario: Rule detail

- **WHEN** a governance member opens a single policy
- **THEN** its conditions and outcome are shown in the same structured form used by the enforcement layer
- **AND** its version history is shown with actor and timestamp per version

---

### Requirement: Structured Rule Editing

Policies SHALL be edited by composing a fixed set of conditions over the policy
inputs defined in the PRD into one of the outcomes `ALLOW`, `MAKE_SAFE` or
`BLOCK`. The cockpit SHALL NOT accept free-form code or expressions as rule
content.

The editor SHALL show the difference against the currently active version before
the change can be submitted.

**Priority:** MVP

#### Scenario: Condition outside the supported set

- **WHEN** a rule is submitted referencing an input that the enforcement layer does not evaluate
- **THEN** the submission is rejected with the unsupported input named

#### Scenario: Diff before publish

- **WHEN** a governance member submits an edited rule
- **THEN** the change against the active version is displayed
- **AND** publishing requires an explicit confirmation of that diff

---

### Requirement: Immutable Policy Versions

Publishing SHALL create a new immutable policy-set version rather than mutating
the active one. Every enforcement decision SHALL remain attributable to the exact
version that produced it.

**Priority:** MVP

#### Scenario: Publish creates a version

- **WHEN** a rule change is published
- **THEN** a new policy-set version identifier is created
- **AND** the previous version remains retrievable unchanged

#### Scenario: Historical decision stays interpretable

- **WHEN** an audit event from before the change is inspected
- **THEN** the policy version it names still resolves to the rule text that was active at that time

---

### Requirement: Rollback

Governance SHALL be able to make any previous policy-set version active again in
a single action, without editing rules to reconstruct it. Rollback SHALL itself
create a new active version rather than deleting history.

**Priority:** MVP

#### Scenario: Bad rule rolled back

- **WHEN** a governance member rolls back to the previous version
- **THEN** that version's rules become active
- **AND** the rollback is recorded with actor, time and the version rolled back from

---

### Requirement: Policy Distribution and Stale-Cache Behaviour

Enforcement points SHALL pull the active policy-set and tool registry and cache
them locally. A published change SHALL reach enforcement points within a defined
refresh interval without the user reinstalling or restarting anything.

When the policy service is unreachable, the enforcement point SHALL continue
enforcing the last known good version rather than failing open or failing shut,
and SHALL surface the cache age to the user.

**Priority:** MVP

#### Scenario: Change propagates

- **WHEN** a policy version is published
- **THEN** enforcement points apply it within the refresh interval without user action

#### Scenario: Policy service unreachable

- **WHEN** an enforcement point cannot reach the policy service
- **THEN** it keeps enforcing the last cached version
- **AND** it does not allow interactions that the cached version would block
- **AND** it does not block interactions that the cached version would allow

#### Scenario: Cache staleness is visible

- **WHEN** the cached policy set is older than the defined staleness threshold
- **THEN** the user is informed that governance rules may be out of date

---

### Requirement: Tool Registry Administration

Governance SHALL be able to add a tool, change its approval status, its assessed
attributes and its resulting permitted data classes. A tool whose approval status
is not approved SHALL NOT be grantable through the registry editor alone.

**Priority:** MVP

#### Scenario: Tool status changed

- **WHEN** a governance member sets a tool's approval status to not approved
- **THEN** the change is published as part of the next registry version
- **AND** enforcement points begin blocking that tool within the refresh interval

#### Scenario: Permitted data classes narrowed

- **WHEN** a data class is removed from a tool's permitted list
- **THEN** existing exceptions that depended on that class are flagged to governance for review

---

### Requirement: Shadow Mode

A policy SHALL be publishable in a state where the enforcement layer evaluates it
and records what it would have decided, without changing what the user
experiences. Monitoring SHALL report shadow outcomes separately from enforced
outcomes.

Rolling out a new `BLOCK` rule to every employee without first observing its real
hit rate is how a governance tool takes an organisation's productivity down.

**Priority:** Post-MVP

#### Scenario: Shadow rule does not intervene

- **WHEN** a rule in shadow state matches an interaction
- **THEN** the user experiences no intervention from that rule
- **AND** the would-be outcome is recorded and counted separately

#### Scenario: Promotion to enforcing

- **WHEN** a shadow rule is promoted to active
- **THEN** it begins intervening from the next published version onward
