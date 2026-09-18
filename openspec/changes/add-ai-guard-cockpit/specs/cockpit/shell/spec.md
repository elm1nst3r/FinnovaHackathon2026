## Purpose

The cockpit shell decides which of the two views a person sees, and guarantees
that every action which changes governance is authorised on the server and
attributable to a named human.

## ADDED Requirements

### Requirement: Identity-Driven View Selection

The cockpit SHALL derive the available views from the signed-in user's identity
group membership. Every authenticated Finnova employee SHALL receive the
employee view. Members of the governance group SHALL additionally receive the
governance view. The cockpit SHALL NOT manage users, roles or group membership.

**Priority:** MVP

#### Scenario: Employee without governance membership

- **WHEN** an authenticated employee who is not in the governance group opens the cockpit
- **THEN** the employee view is shown
- **AND** no navigation entry, route or data belonging to the governance view is reachable

#### Scenario: Governance member

- **WHEN** an authenticated user in the governance group opens the cockpit
- **THEN** both views are available and the user can switch between them
- **AND** the currently active view is unambiguous on screen

#### Scenario: Unauthenticated access

- **WHEN** an unauthenticated request reaches any cockpit route
- **THEN** no cockpit data is returned and the user is sent to authentication

---

### Requirement: Server-Side Authorisation of Governance Actions

Every action that changes a policy, the tool registry, an exception or a request
decision SHALL be authorised on the server against the caller's group membership.
Hiding controls in the user interface SHALL NOT be treated as authorisation.

**Priority:** MVP

#### Scenario: Forged governance request

- **WHEN** a user outside the governance group calls a governance write endpoint directly, bypassing the user interface
- **THEN** the request is rejected with an authorisation error
- **AND** no state changes
- **AND** the attempt is recorded

#### Scenario: Group membership revoked mid-session

- **WHEN** a user's governance group membership is removed and the user submits a governance write using an existing session
- **THEN** the write is rejected

---

### Requirement: Attribution of Governance Changes

Every governance write SHALL record the acting user's identity, a timestamp, the
previous and new value, and — where the action grants or widens access — a
mandatory free-text reason. These records SHALL be immutable and SHALL be kept
separately from the pseudonymous usage audit log.

**Priority:** MVP

#### Scenario: Policy published

- **WHEN** a governance member publishes a policy version
- **THEN** an immutable record is written naming the actor, the time, the previous version and the new version

#### Scenario: Reason omitted on an access-widening action

- **WHEN** a governance member tries to create an exception without a reason
- **THEN** the action is rejected and nothing is written

#### Scenario: Attribution is not usage monitoring

- **WHEN** governance change records are queried
- **THEN** they contain only governance actions by governance actors
- **AND** they contain no record of any employee's AI interactions
