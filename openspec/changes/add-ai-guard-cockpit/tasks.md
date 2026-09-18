## 1. Foundations

- [x] 1.1 Define the shared governance data model: policy set version, rule, tool registry entry, exception, request. One schema module consumed by cockpit, policy service and enforcement point.
- [x] 1.2 Seed fixture data covering the six PRD rules, three tools, two employees and one governance member, so every later task has something to run against.
- [x] 1.3 Policy service: read endpoints for active policy set, tool registry, and "my exceptions" for the authenticated caller.
- [x] 1.4 Mocked identity with group membership, matching the PRD's mocked identity decision. Two fixtures: plain employee, governance member.

## 2. Cockpit shell

- [x] 2.1 Application shell with view switching driven by group membership.
- [x] 2.2 Server-side authorisation middleware on every governance write endpoint. Write the negative test first: a plain employee calling a write endpoint directly must be rejected.
- [x] 2.3 Governance change record: actor, timestamp, before, after, mandatory reason on access-widening actions. Immutable, stored separately from the audit log.

## 3. Employee view — demo critical

- [x] 3.1 Local usage history store in the extension: append on every decision, metadata only, bounded retention.
- [x] 3.2 History screen with decision, tool, classification, policy IDs and detected categories.
- [x] 3.3 Clear-history action, with no notification and no governance record.
- [x] 3.4 Effective permissions matrix: tools by data classification, including tools the employee may not use and the reason.
- [x] 3.5 Fold active exceptions into the matrix, showing scope and expiry as the reason for widened access.
- [x] 3.6 Verify no prompt content, detected values or pseudonymisation mapping reach the history store.

## 4. Governance view — demo critical

- [x] 4.1 Policy catalogue: ID, name, outcome, state, active version, hit count.
- [x] 4.2 Monitoring panel reusing the aggregate figures already specified in the PRD, plus a shadow-IT panel listing blocked unregistered tools.
- [x] 4.3 Structured rule editor over the fixed condition set, with a diff against the active version before publish.
- [x] 4.4 Publish creates an immutable policy set version; previous versions stay retrievable.
- [x] 4.5 One-action rollback that itself creates a new active version.
- [x] 4.6 Tool registry editor: approval status, assessed attributes, permitted data classes.

## 5. Exceptions

- [x] 5.1 Exception creation with mandatory subject, scope, policy IDs, justification and expiry.
- [x] 5.2 Server-side rejection of exceptions naming the credential or strictly-confidential policy, including the mixed case. Test before UI.
- [x] 5.3 Enforcement point applies suppression before precedence; remaining rules still evaluated.
- [x] 5.4 Audit event carries suppressed policy IDs and the exception identifier.
- [x] 5.5 Expiry takes effect without manual action; revocation propagates within the refresh interval.

## 6. Access requests — closes the loop

- [x] 6.1 "Request access" action on a `BLOCK` intervention, pre-filled with tool, classification and blocking policy IDs, justification required.
- [x] 6.2 Assert the pre-fill carries no prompt content or detected values.
- [x] 6.3 Request queue for governance with requester, scope, justification, blocking policy and age.
- [x] 6.4 Approve and reject with attribution; rejection requires a reason shown to the requester.
- [x] 6.5 Requester may not decide their own request, governance membership notwithstanding.
- [x] 6.6 Approval creates a scoped expiring exception, or prompts for tool registration when the tool is unknown.
- [x] 6.7 Refuse approval where the result would require suppressing a non-suppressible policy.
- [x] 6.8 Request status in the employee view, including granted scope and expiry.

## 7. Distribution and resilience

- [x] 7.1 Enforcement point pulls policy set, registry and own exceptions on a refresh interval, and caches them.
- [x] 7.2 Unreachable policy service keeps the last known good version in force — verify it neither fails open nor fails shut.
- [x] 7.3 Surface cache age once past the staleness threshold.

## 8. Demo readiness

- [ ] 8.1 End-to-end rehearsal: block, request, approve in the governance view, retry succeeds under the new exception.
- [ ] 8.2 Rehearse the same path with the policy service stopped, to prove enforcement survives it.
- [x] 8.3 Seeded history and monitoring figures that look plausible on screen without fabricating individual people.
- [x] 8.4 Check every screen for accidental exposure of prompt content before the pitch.

## 9. Deferred — do not start before section 8 passes

- [ ] 9.1 Shadow mode: evaluate without intervening, count separately in monitoring.
- [ ] 9.2 Replay a candidate rule against historical audit events, which is possible because events retain detected categories, classification and tool without content.
- [ ] 9.3 Four-eyes approval of policy changes.
- [ ] 9.4 Staged rollout by population.
- [ ] 9.5 Expiry and renewal reminders for exceptions.
