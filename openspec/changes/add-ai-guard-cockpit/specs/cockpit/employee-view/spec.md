## Purpose

The employee view answers three questions without anyone having to be asked:
what may I use, what did AI Guard decide about my usage, and what happened to my
request. It does this without creating a per-person usage record on any server.

## ADDED Requirements

### Requirement: Personal Usage History Is Browser-Local

The employee's usage history SHALL be stored only in the enforcement point on the
employee's own device. No server SHALL hold a record that links an identified
employee to their individual AI interactions.

This is the constraint that makes the employee view compatible with the
"employees are not monitored" commitment. Transparency for the individual and
surveillance by the employer differ only in who can read the record, so the
record must be physically out of the employer's reach.

**Priority:** MVP

#### Scenario: History is readable by its owner

- **WHEN** an employee opens their usage history on the device where the interactions happened
- **THEN** their decisions are listed with timestamp, tool, declared classification, decision and the policy IDs involved

#### Scenario: No server-side personal history exists

- **WHEN** the server-side stores are inspected for a named employee's interaction history
- **THEN** no such record exists to be returned, by design rather than by access control

#### Scenario: History is per-device

- **WHEN** an employee opens the cockpit on a different device
- **THEN** only that device's history is shown
- **AND** the employee is told that history is local to each device

---

### Requirement: History Content Limits

The local history SHALL contain metadata only: timestamp, tool, declared
classification, decision, policy IDs, and the categories of data detected. It
SHALL NOT contain prompt text, AI responses, detected values, or the
pseudonymisation mapping.

**Priority:** MVP

#### Scenario: Sensitive content is absent

- **WHEN** the local history store is inspected after a `MAKE_SAFE` decision
- **THEN** it records that a person name and an IBAN were detected
- **AND** it contains neither the name nor the IBAN nor the prompt

---

### Requirement: History Retention and User Control

The local history SHALL be limited to a bounded retention window, oldest entries
being discarded automatically. The employee SHALL be able to clear their history
at any time, and clearing SHALL NOT require approval or notify anyone.

**Priority:** MVP

#### Scenario: Automatic ageing

- **WHEN** an entry is older than the retention window
- **THEN** it is no longer present

#### Scenario: Employee clears history

- **WHEN** an employee clears their history
- **THEN** it is empty
- **AND** no notification is generated and no governance record is created

---

### Requirement: Effective Permissions Overview

The employee view SHALL show, for every tool in the registry, which data
classifications that employee may use it for, taking their active exceptions into
account. Tools the employee may not use SHALL be shown as such rather than
hidden.

Showing only the permitted tools would answer "what can I do" but not "why can I
not do the thing I was about to do", which is the question people actually
arrive with.

**Priority:** MVP

#### Scenario: Permission matrix

- **WHEN** an employee opens their permissions
- **THEN** each registered tool is listed with the data classifications they may and may not use it for

#### Scenario: Exception reflected

- **WHEN** an employee has an active exception widening their access
- **THEN** the overview reflects the widened access
- **AND** names the exception and its expiry date as the reason

#### Scenario: Unapproved tool

- **WHEN** a tool is not approved
- **THEN** it is shown as not usable, with the approval status as the reason

---

### Requirement: Own Request Status

The employee SHALL see their own requests with current state, and for terminal
states the decision reason and, where approved, the resulting scope and expiry.

**Priority:** MVP

#### Scenario: Pending request

- **WHEN** an employee has a submitted request
- **THEN** it is shown as pending with its submission date

#### Scenario: Approved request

- **WHEN** a request has been approved
- **THEN** the employee sees the granted scope and its expiry date

---

### Requirement: No Third-Party Access to Personal History

The cockpit SHALL NOT provide any view, export or report that allows a manager,
governance member or administrator to read an identified employee's usage
history. Governance reporting SHALL remain aggregate and pseudonymous.

**Priority:** MVP

#### Scenario: No drill-down from aggregates

- **WHEN** a governance member views an aggregate figure in monitoring
- **THEN** there is no path from that figure to the individuals behind it

#### Scenario: No manager view

- **WHEN** any user attempts to retrieve another named user's usage history
- **THEN** no such capability exists in the cockpit
