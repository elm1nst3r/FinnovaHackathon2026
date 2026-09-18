## Purpose

An exception lets governance say "this person, this tool, this data class, until
this date" instead of choosing between blocking someone indefinitely and
relaxing a rule for everyone.

## ADDED Requirements

### Requirement: Scoped and Time-Limited Exceptions

An exception SHALL name a subject (a user or an identity group), a scope (at
minimum a tool and a data class), the policy IDs it suppresses, a justification,
the granting governance member, and an expiry date. None of these SHALL be
optional, and an exception SHALL NOT be grantable without an expiry.

**Priority:** MVP

#### Scenario: Complete exception granted

- **WHEN** a governance member grants an exception with subject, scope, policy IDs, justification and expiry
- **THEN** the exception becomes active and is retrievable by enforcement points for that subject

#### Scenario: Unbounded exception refused

- **WHEN** an exception is submitted without an expiry date, or with an expiry beyond the configured maximum
- **THEN** it is rejected and nothing is written

#### Scenario: Scope is honoured

- **WHEN** a subject with an exception for tool A uses tool B under otherwise identical conditions
- **THEN** the exception does not apply and the original decision stands

---

### Requirement: An Exception Licenses Data, Not Tools

An exception SHALL NOT name a tool that is absent from the registry, nor a tool
that is present but not approved for Finnova use. The refusal SHALL happen in
exception validation itself, so that it holds on every route that creates an
exception — the direct grant and the approval of an access request alike.

An exception is a decision about which data may go to a tool the bank has
already assessed. Letting it also stand in for the assessment would make tool
approval optional for anyone willing to ask, and would turn the request queue
into a self-service route around it, one person at a time. The answer to
"I need this tool" is to assess the tool.

**Priority:** MVP

#### Scenario: Exception for an unapproved tool

- **WHEN** an exception naming a registered but unapproved tool is submitted, by either route
- **THEN** it is rejected, the attempt is recorded, and governance is directed to assess the tool

#### Scenario: Exception for an unregistered tool

- **WHEN** an exception naming a tool absent from the registry is submitted
- **THEN** it is rejected and nothing is written

---

### Requirement: Expiry Is Resolved to the End of the Chosen Day

Where an expiry is chosen as a calendar day, it SHALL be stored as the end of
that day in the local timezone. "Until 2 November" has to remain true for the
whole of 2 November for the people the exception applies to.

**Priority:** MVP

#### Scenario: Expiry shown consistently

- **WHEN** an exception granted until a given day is displayed in the permissions matrix and in the exception list
- **THEN** both show the same calendar day

---

### Requirement: Non-Suppressible Policies

The credential policy and the strictly-confidential policy SHALL NOT be nameable
in any exception. The rejection SHALL happen on the server, not only in the user
interface.

A leaked credential is an incident, not a policy preference; nobody should be
able to grant themselves or a colleague the right to paste secrets into a
chatbot. Strictly confidential data leaving Finnova is a policy decision that has
to be made visibly, not through a per-user exception dialogue.

**Priority:** MVP

#### Scenario: Credential policy named

- **WHEN** an exception naming the credential policy is submitted
- **THEN** it is rejected with the reason stated
- **AND** the attempt is recorded

#### Scenario: Strictly confidential policy named

- **WHEN** an exception naming the strictly-confidential policy is submitted
- **THEN** it is rejected

#### Scenario: Mixed submission

- **WHEN** an exception names both a suppressible and a non-suppressible policy
- **THEN** the whole exception is rejected rather than partially applied

---

### Requirement: Exception Effect on Decisions

An active, in-scope exception SHALL suppress the policies it names before
precedence is evaluated. The remaining matching policies SHALL still apply. The
resulting audit event SHALL record which policies were suppressed and under which
exception.

**Priority:** MVP

#### Scenario: Suppressed policy no longer blocks

- **WHEN** an interaction matches only policies that an active in-scope exception suppresses
- **THEN** the decision is the outcome of the remaining rules

#### Scenario: Other policies still apply

- **WHEN** an interaction matches a suppressed policy and also the credential policy
- **THEN** the decision is `BLOCK`

#### Scenario: Suppression is auditable

- **WHEN** a decision was influenced by an exception
- **THEN** the audit event names the suppressed policy IDs and the exception identifier

---

### Requirement: Exception Transparency

A subject SHALL be able to see every active exception that applies to them, with
its scope, justification and expiry. There SHALL be no exception that is
enforceable against a person but hidden from them.

**Priority:** MVP

#### Scenario: Subject views own exceptions

- **WHEN** an employee opens their permissions view
- **THEN** every active exception applying to them is listed with scope, justification and expiry

---

### Requirement: Expiry and Revocation

An exception SHALL stop having effect at its expiry without any action being
taken. Governance SHALL be able to revoke an exception before expiry, and the
revocation SHALL reach enforcement points within the policy refresh interval.
Exceptions approaching expiry SHALL be surfaced to governance.

**Priority:** MVP for expiry and revocation, Post-MVP for renewal reminders

#### Scenario: Expired exception

- **WHEN** an exception's expiry date has passed
- **THEN** the policies it named apply again to the subject
- **AND** no manual cleanup was required

#### Scenario: Revocation

- **WHEN** a governance member revokes an active exception
- **THEN** it stops applying within the refresh interval
- **AND** the revocation is attributed to the revoking member

#### Scenario: Expiry visibility

- **WHEN** governance opens the exceptions list
- **THEN** exceptions expiring within the configured warning window are distinguishable from the rest
