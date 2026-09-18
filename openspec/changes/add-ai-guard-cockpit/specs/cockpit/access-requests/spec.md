## Purpose

When a rule blocks someone who has a legitimate need, the request is the route
forward. It starts at the intervention that blocked them and ends in a governance
decision that changes what the enforcement layer does.

## ADDED Requirements

### Requirement: Request Raised From an Intervention

An employee SHALL be able to start a request directly from a `BLOCK`
intervention. The request SHALL be pre-filled with the tool, the declared data
classification and the policy IDs that produced the block, so that the employee
only supplies a justification.

The pre-fill SHALL NOT include prompt content or detected values.

**Priority:** MVP

#### Scenario: Request from a block

- **WHEN** an employee chooses to request access from a `BLOCK` intervention
- **THEN** a request is opened pre-filled with tool, data classification and blocking policy IDs
- **AND** the only field the employee must complete is the justification

#### Scenario: No content leaks into the request

- **WHEN** a request created from an intervention is inspected by governance
- **THEN** it contains no prompt text and no detected values

#### Scenario: Request without justification

- **WHEN** an employee submits a request with an empty justification
- **THEN** the submission is rejected

---

### Requirement: Request Lifecycle

A request SHALL be in exactly one of the states submitted, information
requested, approved, or rejected. Every transition SHALL record the acting user
and a timestamp. A rejection SHALL carry a reason that is shown to the requester.

**Priority:** MVP

#### Scenario: Approval

- **WHEN** a governance member approves a request
- **THEN** the request moves to approved and the decision is attributed

#### Scenario: Rejection carries a reason

- **WHEN** a governance member rejects a request without a reason
- **THEN** the rejection is not accepted

#### Scenario: Requester sees the outcome

- **WHEN** a request reaches a terminal state
- **THEN** the requester can see the state and the reason in their own view

---

### Requirement: Separation of Requester and Approver

The user who raised a request SHALL NOT be able to decide it, even if that user is
a member of the governance group.

**Priority:** MVP

#### Scenario: Governance member requests for themselves

- **WHEN** a governance member raises a request and then attempts to approve it
- **THEN** the approval is rejected and the request remains open for another approver

---

### Requirement: Approval Produces an Enforceable Result

Approving a request SHALL produce a concrete change that the enforcement layer
can act on — an exception for the requester, or a tool registry change. An
approval SHALL NOT be a status change alone.

Where the approved result would require suppressing a non-suppressible policy,
the approval SHALL be refused with that reason.

**Priority:** MVP

#### Scenario: Approval grants an exception

- **WHEN** a request for a tool and data class is approved
- **THEN** a scoped, expiring exception for the requester is created
- **AND** the requester's next matching interaction is decided under that exception

#### Scenario: Approval requiring an unapprovable suppression

- **WHEN** a request would require suppressing the credential policy
- **THEN** the request cannot be approved and the reason is shown to both parties

#### Scenario: Request for an unknown tool

- **WHEN** a request names a tool that is not in the registry
- **THEN** governance is prompted to assess and register the tool before the request can be approved

---

### Requirement: Request Queue

Governance SHALL see all open requests in one place, with the requester, the
requested scope, the justification, the policy that blocked, and the age of the
request.

**Priority:** MVP

#### Scenario: Queue contents

- **WHEN** a governance member opens the request queue
- **THEN** every open request is listed with requester, scope, justification, blocking policy and age

#### Scenario: Recurring requests are visible as a pattern

- **WHEN** multiple requests name the same tool and data class
- **THEN** governance can see that they belong together, as a signal that the rule or the registry may be wrong rather than the people
