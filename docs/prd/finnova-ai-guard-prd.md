# PRD — Finnova AI Guard

As of 2026-09-18 · Elena Kuprienko · v0.3 (cockpit)

**Status:** Hackathon Concept  
**Working Title:** Finnova AI Guard  
**Product Type:** AI Governance Enforcement Layer  
**Primary Users:** Finnova employees, CISO, AI Review Board (ARB), GRC, AI tool owners  
**North Star:** **Time to Safe AI Use → Zero**  
**Related documents:** [Finnova AI Cockpit and Regula PRD](finnova-pet-prd.md) (see Section 25)

> Paragraphs marked **Decision (v0.2)** record choices made while resolving the audit findings.  
> Paragraphs marked **Decision (v0.3)** record choices made while adding the cockpit.  
> All of them are proposals and can be overruled.

### What changed in v0.3

The enforcement layer gained a control surface: the **AI Guard Cockpit**, with a
**CISO/Governance view** (policies, tool registry, monitoring, exceptions,
requests) and an **Employee view** (own usage history, own permissions, request
additional access). Section 14 is new, FR-15 to FR-21 are new, and Sections 8,
9, 15, 17 and 25 changed substantively — in particular the privacy model, which
had to be reworked before a per-user view could exist at all (Section 17).

---

## 1. Executive Summary

Finnova AI Guard is a governance enforcement layer that allows employees to use AI in the tools they already prefer while automatically applying Finnova's AI governance rules in the background.

The core idea is simple:

> **Employees should not have to interpret AI governance. Governance should be enforced by the system.**

Today, safe AI usage requires employees to understand which tools are approved, which data may be used, which restrictions apply, and when an approval is required. This creates friction, uncertainty and the risk of incorrect interpretation.

AI Guard moves governance from documentation into infrastructure.

Employees continue to work in the AI tools they already use. AI Guard evaluates the interaction before sensitive content is sent to the AI provider and decides whether the interaction can proceed, needs to be modified, or must be blocked.

The hackathon prototype governs browser-based AI tools (ChatGPT, Claude, optionally Gemini) through a browser extension. Copilot, IDE assistants and API usage are part of the production vision (Section 16), not of the prototype.

Enforcement alone is not enough. Rules nobody can inspect or change become shelfware, and a system that silently intervenes without letting people see what it did breeds distrust — and distrusted extensions get switched off. AI Guard therefore ships with a **cockpit** (Section 14) that has two views: governance owns and tunes the rules, and employees can see what the system decided about their own usage, what they are allowed to use today, and ask for more.

The employee remains responsible for the quality and use of AI-generated output. However, the employee should not be responsible for manually interpreting governance rules before every interaction.

---

## 2. Problem

### The challenge

The hackathon challenge asks:

> **How can an employee know within two minutes whether AI can safely be used for a task?**

Our position is that two minutes is already too long for routine use. The employee should not have to find out at all; the system should know.

### Context

Finnova wants AI to be easy to use and broadly accessible while complying with:

- data protection requirements,
- information security requirements,
- regulatory requirements,
- internal policies,
- data-classification rules,
- technical requirements for approved AI services.

The current governance model creates several usability problems:

1. Employees need to know which AI tools they may use.
2. Employees need to understand which data classifications are permitted for each tool.
3. Employees need to correctly interpret governance rules.
4. Employees may need to search for policies, factsheets or approval information before acting.
5. Governance teams have limited visibility into how policies are applied in everyday AI usage.
6. A policy document can guide behaviour, but it cannot technically prevent a prohibited action.

This creates a gap between **policy** and **actual AI usage**.

---

## 3. Product Vision

### Vision

> **Use AI where you want. Governance follows you.**

AI Guard should become an invisible safety layer between employees and AI services.

Instead of forcing employees into a new central AI application, Finnova should support AI usage in the tools employees already prefer and apply governance automatically at the point of use.

### Product Principle

> **From policies people must remember to policies the system enforces.**

### User Promise

> **If AI Guard lets it through, the governance checks that can be automated have already been applied.**

This does **not** remove the employee's responsibility to critically review AI output and use it appropriately.

---

## 4. Goals

### Primary Goals

1. Reduce the cognitive burden of AI governance for employees.
2. Prevent clearly prohibited AI interactions before data leaves Finnova-controlled environments.
3. Automatically make interactions safe where possible instead of simply blocking them.
4. Allow employees to continue using their preferred AI tools.
5. Translate Finnova AI Governance into machine-readable policies.
6. Give ARB and GRC transparency into governed AI usage.
7. Reduce unnecessary governance requests and manual clarification.
8. Let governance change AI policy themselves, safely and reversibly, without an engineering release.
9. Let employees see their own AI usage and current permissions, and request more access when a rule blocks them.

### Hackathon Goal

Demonstrate with a working prototype that Finnova AI Governance can be translated into an automated enforcement layer with three outcomes:

- **ALLOW**
- **MAKE SAFE**
- **BLOCK**

and that the loop closes: a block leads to a request, a request leads to a governance decision, and the decision changes what the enforcement layer does next time.

---

## 5. Non-Goals

The hackathon prototype will **not**:

- replace the full Finnova AI Governance process,
- replace ARB or GRC decision-making,
- automate every possible governance rule,
- integrate with every AI provider,
- provide a production-ready DLP solution,
- perform legally binding data classification,
- replace existing identity and access management,
- replace tool approval or procurement processes,
- guarantee correctness of AI-generated output,
- remove employee responsibility for reviewing AI output,
- prevent deliberate circumvention (disabling the extension, using another browser, uploading screenshots). The extension demonstrates the user experience of an enforcement point; production enforcement points are listed in Section 16.

The cockpit specifically will **not**:

- become an identity or access management system. It reads existing identity groups; it does not create users, roles or groups,
- become a ticketing system. A request is a lightweight object with one approver, not a workflow engine,
- offer a free-form scripting language for policies. The rule editor composes a fixed set of conditions (Section 9) into a fixed set of outcomes,
- give managers or GRC a per-user view of who prompted what (Section 17). No amount of product convenience justifies turning this into surveillance.

---

## 6. Users and Personas

### 6.1 Employee

**Need:** Use AI productively without studying governance documentation.

**Desired experience:**

- use preferred AI tools,
- receive no interruption when usage is safe,
- receive an understandable explanation when AI Guard intervenes,
- automatically receive a safer alternative where possible,
- be able to correct AI Guard when it is wrong about non-critical content (see FR-14),
- look up, without asking anyone, which tools they may use for which kind of data (FR-20),
- review what AI Guard decided about their own usage (FR-19),
- ask for additional tools or data classes when a rule blocks them, and see what happened to that request (FR-18).

---

### 6.2 CISO, AI Review Board and GRC

**Need:** Ensure governance rules are applied consistently and auditably, and be able to change them when reality changes.

**Desired experience:**

- see which policies are triggered,
- see blocked or sanitised interactions,
- understand recurring governance issues,
- identify tools or policies requiring reassessment,
- maintain governance rules centrally,
- change a rule and see it take effect without waiting for a software release (FR-16),
- roll a rule back immediately when it turns out to be wrong,
- grant a scoped, time-limited exception instead of having to choose between "blocked forever" and "policy relaxed for everyone" (FR-17),
- decide employee access requests in one place, with the blocking decision as context (FR-18),
- see which unapproved tools people are actually trying to use, as input to the tool roadmap.

The three roles share one view. Splitting CISO, ARB and GRC into separate screens would add access-control complexity without adding information; who may *change* what is governed by identity group, not by a separate UI.

---

### 6.3 AI Tool Owner

**Need:** Understand whether the tool remains compliant with its approved usage.

**Desired experience:**

- see current tool status,
- see applicable policies,
- understand usage patterns and policy violations,
- receive alerts when changes require reassessment (post-hackathon; no functional requirement in this version delivers it, see Section 16).

Tool owners use the CISO view filtered to their own tool. They do not get a third view — see Section 14.

---

## 7. Core User Experience

AI Guard should work primarily **inside the user's existing workflow**, not as a separate place where AI must be used.

### Supported interaction model

```text
Employee
   │
   │ uses preferred AI tool
   ▼
ChatGPT / Copilot / Claude / IDE / API
   │
   ▼
┌──────────────────────────────┐
│      Finnova AI Guard        │
│                              │
│ Identity                     │
│ Content / Data Detection     │
│ Policy Engine                │
│ Redaction / Sanitisation     │
│ Audit                        │
└──────────────┬───────────────┘
               │
        ┌──────┼──────┐
        ▼      ▼      ▼
      ALLOW  MAKE    BLOCK
             SAFE
        │      │
        └──────┴──────────────► AI Provider
```

---

## 8. Decision Model

Every governed AI interaction results in exactly one of three decisions.

### Precedence

All applicable rules are evaluated. The final decision is the most restrictive outcome of any matching rule:

```text
BLOCK  >  MAKE_SAFE  >  ALLOW
```

Example: a prompt containing an API key and a customer name matches the credential rule (BLOCK) and the personal-data rule (MAKE_SAFE). The decision is BLOCK. A prompt that matches no rule is ALLOW.

In prose the outcomes are written ALLOW, MAKE SAFE and BLOCK. In code, events and rules they are the enum values `ALLOW`, `MAKE_SAFE` and `BLOCK`.

### Exceptions

**Decision (v0.3):** An active exception (FR-17) **suppresses the policy IDs it names**, for the subject and scope it names, for as long as it is valid. Precedence is then evaluated over the remaining matching rules.

Suppression was chosen over "downgrade the outcome by one step" because it composes predictably: the other rules keep working, and the audit event can state exactly which policy was suppressed and under which exception.

Two rules can never be named in an exception:

- `CH-AI-CRED-01` — a leaked credential is an incident, not a policy preference. Nobody should be able to grant themselves the right to paste secrets into a chatbot.
- `CH-AI-CONF-02` — strictly confidential data does not leave Finnova through an exception dialogue. If that is ever to change, it changes as a policy decision, visibly, not as a per-user exception.

### 8.1 ALLOW

The interaction complies with the applicable policies.

**User experience:**

- no unnecessary warning,
- no extra click,
- request proceeds normally,
- decision is made in under 200 ms so the user does not notice it.

Example:

> An employee sends non-sensitive internal text to an AI service approved for internal data.

---

### 8.2 MAKE SAFE

The original interaction is not safe, but AI Guard can automatically transform it into a compliant interaction.

Possible transformations:

- redact personal information,
- pseudonymise names,
- remove restricted metadata,
- strip attachments the tool is not approved for.

Every transformation is shown to the user before the request proceeds (FR-08) and can be partially reverted for non-credential content (FR-14).

Example:

```text
Input:
Max Muster, IBAN CH93 0076 ...

Sanitised:
[PERSON_1], [IBAN_REDACTED]
```

User message:

> **Sensitive data detected. We removed 2 sensitive fields before processing.**

The guiding principle is:

> **Do not block if the interaction can safely be transformed.**

**Decision (v0.2):** Routing a request to a different, approved AI service is *not* a MAKE SAFE transformation. A browser extension inside a vendor's web app cannot redirect the request, and a silent tool switch would surprise the user. The wrong-tool case is a BLOCK with a safe alternative (8.3, Scenario 4).

---

### 8.3 BLOCK

The interaction cannot be made compliant automatically.

Examples:

- API keys,
- passwords,
- personal data that cannot be sanitised (Rule 3),
- data classification not permitted for the selected tool,
- use of an unapproved AI service,
- policy explicitly requiring prior approval.

User message:

> **Sending blocked. This content contains information that cannot be sent to this AI service.**

Where possible, AI Guard proposes a safe next step:

- **a different approved tool** for this data class:

  > **Use approved tool instead → Microsoft 365 Copilot**

- **a request for access** when no approved alternative exists or a policy requires prior approval. AI Guard stays with three outcomes; the request is a separate object handled in the cockpit (FR-18). The intervention pre-fills it with the tool, the data class and the policy that blocked, so the employee writes one sentence of justification rather than filling in a form:

  > **No approved tool for this data. Request access →**

**Decision (v0.3):** This supersedes the v0.2 statement that the request flow belongs to the Finnova AI Cockpit. Requests arise *from* an enforcement decision and are meaningless without it, so AI Guard owns the intake and the decision record. Where the Finnova AI Cockpit exists, AI Guard hands the approved result to it rather than maintaining a second approval workflow — see Section 25.

---

## 9. Policy Inputs

The policy engine evaluates several contextual inputs. Confidentiality classification and personal data are **two independent axes**: a document is Internal, Confidential or Strictly Confidential, and it may or may not additionally contain personal data.

| Input | Example | In hackathon prototype |
|---|---|---|
| User identity | Authenticated Finnova user (pseudonymous ID in audit) | Mocked (FR-02) |
| AI service | ChatGPT Enterprise | Yes, from page URL (FR-03) |
| Confidentiality classification | INTERNAL / CONFIDENTIAL / STRICTLY_CONFIDENTIAL | Yes, user-declared (see below) |
| Personal-data signals | Name / email / phone / IBAN | Yes, detected (FR-04) |
| Credential signals | API key / password / token | Yes, detected (FR-04) |
| Special-category personal data | Health, religion, criminal record keywords | Yes, keyword list (Rule 3) |
| Tool approval status | Approved / Restricted / Not approved | Yes, tool registry (FR-12) |
| Hosting region | CH / EU / Other | Yes, tool registry |
| Training behaviour | Customer data used for training: Yes / No | Yes, tool registry |
| Access control | RBAC / Tenant isolation | Yes, tool registry |
| Policy version | Current Finnova AI Governance version | Yes, stamped on every event |
| Active exceptions for this user | Scoped suppression of named policies (Section 8) | Yes, from the cockpit (FR-17) |
| User role / entitlement | Developer / HR / Client Advisory | No. No hackathon rule uses roles; production input |
| Use case | Summarisation / coding / analysis | No. Not detectable; production input |

### How the confidentiality classification is determined

**Decision (v0.2):** Automatic classification of free text is out of scope (Non-Goals). In the prototype the classification is **declared by the user** through a small selector in the extension's prompt bar, defaulting to INTERNAL. Detected content signals can only raise the effective classification, never lower it: a detected IBAN or customer name marks the prompt as containing personal data regardless of what the user selected.

Production options are pre-labelled documents (Microsoft Information Protection labels), source-application context, and classifier models. These are listed as Open Question 2.

---

## 10. Example Policy Rules

The hackathon prototype translates a small subset of Finnova governance rules into machine-readable logic. Rule IDs follow the scheme of the Cockpit rule pack (`CH-<area>-<nn>`, Section 25), so both products can reference the same policy catalogue.

### CH-AI-CRED-01 — Credentials

```text
IF content contains API key, token or password
THEN BLOCK
```

Credentials are never sanitised. A redacted secret is still evidence that a secret was about to leave the company, and the user should rotate it.

### CH-AI-PII-01 — Personal Data, Sanitisable

```text
IF personal data detected
AND selected tool does not permit personal data
AND all detected personal data is sanitisable
THEN MAKE_SAFE
```

### CH-AI-PII-02 — Personal Data, Not Sanitisable

```text
IF personal data detected
AND selected tool does not permit personal data
AND at least one detected item is not sanitisable
THEN BLOCK
```

**Definition — sanitisable (Decision v0.2).** A detected item is sanitisable when it is matched by a structured pattern (name, email, phone number, IBAN) and can be replaced by a placeholder without changing the meaning of the request. An item is **not sanitisable** when:

- it is special-category personal data under Swiss and EU data protection law (health, religion, political opinion, criminal records, biometrics), detected via keyword list in the prototype. Redacting the identifier is not enough here because the sensitive fact stays in the text;
- it is inside an attachment or image the extension cannot rewrite.

With only the FR-04 patterns and no special-category keywords, CH-AI-PII-02 would never fire; the keyword list is therefore part of the MVP detection scope.

### CH-AI-CONF-01 — Confidential Data

```text
IF confidentiality classification = CONFIDENTIAL
AND tool.allowed_data contains CONFIDENTIAL
THEN ALLOW
ELSE BLOCK (with safe alternative)
```

**Decision (v0.2):** Whether a tool has RBAC, tenant isolation, a permitted hosting region and no training on customer data is checked by ARB **at approval time** and recorded in the tool registry (FR-12). The runtime rule reads the resulting `allowed_data` list rather than re-evaluating each attribute. The registry example in FR-12 shows both, so that the pitch can still demonstrate that the governance criteria are machine-readable.

### CH-AI-CONF-02 — Strictly Confidential Data

```text
IF confidentiality classification = STRICTLY_CONFIDENTIAL
THEN BLOCK
```

No external AI service in the registry is approved for strictly confidential data in the prototype.

### CH-AI-TOOL-01 — Unapproved Tool

```text
IF tool approval status = NOT_APPROVED
THEN BLOCK
```

---

## 11. Functional Requirements

### FR-01 — Preferred Tool Usage

Employees must be able to continue using supported AI tools directly rather than being forced into a separate central chat interface.

**Priority:** Must Have

---

### FR-02 — Identity Context

AI Guard must be able to associate the interaction with an authenticated Finnova user or user context. The audit trail carries a pseudonymous user ID, not the user's name (Section 17).

**Priority:** Must Have for concept, mocked for hackathon

---

### FR-03 — Tool Identification

AI Guard must identify which AI service is being used. In the prototype the extension derives this from the page URL and looks the tool up in the registry (FR-12).

**Priority:** Must Have

---

### FR-04 — Sensitive Content Detection

AI Guard must detect selected sensitive data patterns before transmission. Detection runs **inside the browser extension**; prompt content is not sent to any AI Guard backend (Section 17).

Hackathon detection scope (six patterns plus one keyword list):

- API keys and tokens,
- passwords/secrets,
- names,
- email addresses,
- phone numbers,
- IBANs,
- special-category personal data keywords (for CH-AI-PII-02).

**Priority:** Must Have

---

### FR-05 — Policy Evaluation

AI Guard must evaluate detected context against configurable governance rules, applying the precedence in Section 8.

Possible outputs:

- ALLOW,
- MAKE_SAFE,
- BLOCK.

Latency target: an ALLOW decision adds no more than 200 ms between the user's submit and the request leaving the browser.

**Priority:** Must Have

---

### FR-06 — Automatic Sanitisation

AI Guard should redact or pseudonymise selected sensitive information where a safe transformation is possible (definition in Section 10).

**Priority:** Must Have

---

### FR-07 — Blocking

AI Guard must prevent transmission when a policy results in BLOCK.

**Priority:** Must Have

---

### FR-08 — User Explanation

When AI Guard intervenes, the employee must receive a short explanation.

The explanation should answer:

1. What was detected?
2. What did AI Guard do?
3. What can the employee do next?

For MAKE SAFE, the explanation shows the sanitised prompt with the replaced items highlighted so the user sees exactly what was changed.

**Priority:** Must Have

---

### FR-09 — Safe Alternative

A blocked interaction should, where possible, provide a compliant next step: an approved tool for this data class, or a link to the Cockpit request flow when approval is required.

Example:

> This data cannot be used with Tool A. Open in Tool B instead.

**Priority:** Must Have (Scenario 4 and the pitch depend on it)

---

### FR-10 — Audit Event

**Every decision**, including ALLOW, creates a structured audit event. Without ALLOW events the dashboard cannot report the total number of governed interactions.

Example:

```json
{
  "event_id": "…",
  "timestamp": "2026-09-18T10:41:00Z",
  "user": "u-3f9a…",
  "tool": "chatgpt",
  "tool_registry_version": "2026-09-01",
  "classification": "INTERNAL",
  "decision": "MAKE_SAFE",
  "policies": ["CH-AI-PII-01"],
  "policy_version": "finnova-ai-governance-2026.1",
  "detected": ["PERSON_NAME", "IBAN"],
  "action": "REDACT",
  "user_restored": []
}
```

Rules for event content:

- ALLOW events carry only tool, classification, decision and versions; no `detected` list.
- No prompt content, no detected values, no placeholders' originals.
- `user` is a pseudonymous ID resolvable only by GRC under a defined procedure.

**Priority:** Must Have

---

### FR-11 — Governance Monitoring

ARB/GRC should have aggregated governance activity available. This is delivered as the Monitoring panel of the cockpit's governance view (Section 14.1). The panel shows aggregates only; there is no per-user drill-down in this version (Section 17).

Example KPIs:

- AI interactions governed,
- automatically allowed,
- automatically sanitised,
- blocked,
- most frequently triggered policies,
- affected AI tools,
- trends over time,
- blocked attempts against tools that are not in the registry, as a shadow-IT signal for the tool roadmap.

**Priority:** Must Have (pitch step 4 depends on it)

---

### FR-12 — Tool Registry

The prototype should contain a simple registry defining governance capabilities per AI tool. The attributes ARB assessed are recorded alongside the resulting `allowed_data` decision.

Example:

```yaml
tool: chatgpt
display_name: ChatGPT Enterprise
approval_status: APPROVED
registry_version: 2026-09-01
# assessed by ARB at approval time
hosting_region: EU
training_on_customer_data: false
rbac: true
tenant_isolation: true
# resulting runtime permissions
allowed_data:
  - INTERNAL
  - CONFIDENTIAL
personal_data: false
```

**Priority:** Must Have

---

### FR-13 — Response Re-identification

When AI Guard pseudonymised names, the AI's answer will refer to `[PERSON_1]`. The extension keeps the placeholder mapping **in memory for the current page session only** and replaces placeholders in the displayed answer with the original values, so the answer is usable without the user re-typing names. The mapping is never persisted or logged.

If re-identification is not feasible for a tool, the extension shows the mapping in the intervention message instead.

**Priority:** Should Have

---

### FR-14 — Restore False Positives

For MAKE SAFE decisions the user can restore individual replaced items that are not credentials (for example a product name detected as a person). Restoring an item is recorded in the audit event (`user_restored`) so GRC can tune the detectors. Credentials and special-category items cannot be restored.

**Priority:** Should Have

---

### FR-15 to FR-21 — Cockpit Requirements

**Decision (v0.3):** The cockpit is built spec-first with [OpenSpec](https://openspec.dev/). Its requirements and acceptance scenarios live in the change proposal, not in this PRD:

```text
openspec/changes/add-ai-guard-cockpit/
  proposal.md    why the cockpit exists, what changes, impact
  design.md      the decisions and their rationale
  specs/cockpit/ the binding requirements, as scenarios
  tasks.md       implementation order
```

Restating them here would create two sources for one requirement, and the two would drift within a day. This PRD therefore owns the *why* and the product-level decisions; the specs own the *what*.

| ID | Requirement | View | Capability | Priority |
|---|---|---|---|---|
| FR-15 | Cockpit shell, identity-driven views, server-side authorisation | both | `cockpit/shell` | Must Have |
| FR-16 | Policy catalogue, structured rule editing, immutable versions, rollback, distribution, tool registry | Governance | `cockpit/policy-administration` | Must Have |
| FR-17 | Scoped, time-limited, transparent exceptions; non-suppressible policies | Governance | `cockpit/exceptions` | Must Have |
| FR-18 | Access requests from an intervention through to an enforceable decision | both | `cockpit/access-requests` | Must Have |
| FR-19 | Own usage history, browser-local, metadata only | Employee | `cockpit/employee-view` | Must Have |
| FR-20 | Effective permissions overview and own request status | Employee | `cockpit/employee-view` | Must Have |
| FR-21 | Shadow mode and rule replay against historical events | Governance | `cockpit/policy-administration` | Could Have, post-hackathon |

---

## 12. Hackathon MVP

### MVP Scope

The prototype should demonstrate the concept with:

- 1 browser extension,
- 2–3 AI web tools,
- 3 confidentiality classifications (INTERNAL, CONFIDENTIAL, STRICTLY_CONFIDENTIAL) plus the orthogonal personal-data flag,
- 3 policy outcomes,
- 6 detection patterns plus one keyword list (FR-04),
- 1 policy engine with the six rules of Section 10,
- 1 cockpit with 2 views (Section 14),
- 1 exception mechanism,
- 1 request flow from block to decision to changed enforcement,
- 1 audit log.

The enforcement layer is the product. If the build runs short, the cockpit degrades to seeded read-only views — the extension must never degrade.

### Recommended Supported Tools

For the demo:

- ChatGPT,
- Claude,
- optionally Gemini.

The prototype does not need deep provider integration. The browser extension intercepts the submit action, inspects the content and either allows, modifies or blocks the request.

---

## 13. Hackathon Demo Scenarios

### Scenario 1 — Safe Interaction

**User action**

Employee enters, with classification left at the default INTERNAL:

> Summarise the following internal architecture description.

**Expected result**

```text
Decision: ALLOW
```

The interaction proceeds without additional friction.

**Message**

No warning required.

---

### Scenario 2 — Automatically Made Safe

**User action**

Employee enters customer information containing:

- name,
- email,
- IBAN.

**Expected result**

```text
Decision: MAKE_SAFE   (CH-AI-PII-01)
```

AI Guard detects and sanitises the sensitive information and shows the three replacements.

**Message**

> **Sensitive information detected. AI Guard replaced 3 fields before processing.**

The employee can continue without leaving the AI tool. When the answer arrives, the customer's name is shown again in place of `[PERSON_1]` (FR-13).

---

### Scenario 3 — Blocked Secret

**User action**

Employee pastes a production API key.

**Expected result**

```text
Decision: BLOCK   (CH-AI-CRED-01)
```

The submit action is prevented.

**Message**

> **Sending blocked. A credential was detected and cannot be shared with this AI service. Consider rotating it.**

This is the main "parental control" moment of the demo.

---

### Scenario 4 — Wrong Tool, Safe Alternative

**User action**

Employee sets the classification to CONFIDENTIAL and uses a tool whose registry entry does not allow confidential data.

**Expected result**

```text
Decision: BLOCK   (CH-AI-CONF-01)
```

**Message**

> This type of data is not approved for use with this service.

> **Open in approved tool →**

---

### Scenario 5 — The Loop Closes

This is the scenario the cockpit exists for, and the one that separates AI Guard
from a DLP filter.

**User action**

From the block in Scenario 4, the employee chooses **Request access →**, writes
one sentence of justification and submits.

**Governance action**

In the cockpit's governance view the request appears with the requester, the
tool, the data class and the policy that blocked. The approver grants a scoped
exception expiring in 30 days.

**User action**

The employee retries the same prompt.

**Expected result**

```text
Decision: ALLOW   (CH-AI-CONF-01 suppressed by exception EX-104)
```

**Message**

> Allowed under an exception granted on 18 Sep 2026, expiring 18 Oct 2026.

The employee sees the exception in their permissions view; the audit event
records which policy was suppressed and under which exception.

> **If time runs short**, show the two cockpit views with seeded data and narrate
> this loop instead of executing it live. The live version is the stronger
> finish, but it is the most fragile part of the demo.

---

## 14. AI Guard Cockpit

Enforcement happens in the browser. The cockpit is where the rules behind it are
owned, inspected and changed — and where employees can see what the system knows
and decided about them.

**Decision (v0.3):** One application, two views, selected by identity group.
Everyone gets the Employee view. Members of the governance group additionally
get the Governance view. There is no separate admin tool and no third view for
tool owners; tool owners use the Governance view filtered to their tool. A third
view would add access-control surface without adding information.

```text
                       AI Guard Cockpit
        ┌─────────────────────┬─────────────────────┐
        │  CISO / Governance  │      Employee       │
        ├─────────────────────┼─────────────────────┤
        │ Policies            │ My AI usage         │
        │ Tool registry       │ My permissions      │
        │ Monitoring          │ My requests         │
        │ Exceptions          │                     │
        │ Requests            │                     │
        └─────────────────────┴─────────────────────┘
            governance group          everyone
```

Requirements and acceptance scenarios for everything below live in
`openspec/changes/add-ai-guard-cockpit/` (see FR-15 to FR-21). This section
describes the product intent and the priorities.

### 14.1 CISO / Governance View

**Policies.** The rule catalogue with ID, outcome, lifecycle state, active
version and hit count. Rules are edited by composing the conditions from
Section 9 — not by writing expressions. Publishing creates a new immutable
version; rollback to any previous version is one action. Governance can change
policy without waiting for a release, and can undo it just as fast.

**Tool registry.** Approval status, the attributes ARB assessed, and the
resulting permitted data classes (FR-12). Removing a data class flags the
exceptions that depended on it.

**Monitoring.** Aggregates only, no per-user drill-down.

| Metric | Value |
|---|---:|
| Governed AI interactions | 1,284 |
| Allowed automatically | 1,219 |
| Made safe automatically | 51 |
| Blocked | 14 |
| Open incidents | 1 |

| Policy | Outcome | Events |
|---|---|---:|
| CH-AI-PII-01 Personal Data | MAKE_SAFE | 51 |
| CH-AI-CRED-01 Credentials | BLOCK | 8 |
| CH-AI-CONF-01 Restricted Data Class | BLOCK | 4 |
| CH-AI-TOOL-01 Unapproved Tool | BLOCK | 2 |

(51 sanitised + 14 blocked = 65 intervention events.)

| Tool | Status | Governed Interactions | Blocks |
|---|---|---:|---:|
| ChatGPT | Approved | 624 | 5 |
| Gemini | Approved | 502 | 1 |
| Claude | Restricted | 158 | 8 |

One panel is new and pays for itself: **blocked attempts against tools that are
not in the registry**. That is a ranked list of the AI tools employees actually
want, which is a better tool roadmap than any survey.

**Exceptions.** Scoped, justified, attributable and expiring — see Section 8.
`CH-AI-CRED-01` and `CH-AI-CONF-02` can never be named in one.

**Requests.** The queue from 14.2, with the blocking decision as context.
Repeated requests for the same scope are shown as a group: that pattern usually
means the rule or the registry is wrong, not the people.

### 14.2 Employee View

**My AI usage.** What AI Guard decided about this employee's own interactions —
timestamp, tool, classification, decision, policy IDs, detected categories. No
prompt content, ever.

**Decision (v0.3):** This history is stored **in the employee's browser only**.
No server holds a record linking an identified employee to their individual AI
interactions. Section 17 explains why this is not a detail.

**My permissions.** Every registered tool against every data classification,
with the employee's own exceptions folded in. Tools they may *not* use are shown
as such, with the reason — people arrive with the question "why was I blocked",
not "what am I allowed".

This panel is the most direct answer this product gives to the hackathon
challenge. The question "can I use AI for this task?" gets answered in seconds,
by looking, and zero times thereafter because the enforcement layer already
knows.

**My requests.** State, decision reason, and for approved requests the granted
scope and expiry.

### 14.3 Priorities

| Capability | View | Priority |
|---|---|---|
| Shell, identity-driven views, server-side authorisation | both | MVP |
| Policy catalogue and monitoring (read-only) | Governance | MVP |
| Rule editing, versioning, rollback | Governance | MVP |
| Tool registry administration | Governance | MVP |
| Exceptions: create, scope, expire, revoke | Governance | MVP |
| Access requests end to end | both | MVP — Scenario 5 depends on it |
| My usage history, permissions, request status | Employee | MVP |
| Shadow mode, rule replay against history | Governance | Post-hackathon |
| Four-eyes on policy changes, staged rollout | Governance | Post-hackathon |
| Email/chat notifications, renewal reminders | both | Post-hackathon |

### 14.4 Deliberately Not Built

- No identity management. Group membership is read, never written.
- No workflow engine. One approver, four request states, no routing.
- No rule scripting language.
- No manager view, no per-user drill-down for governance, no export of an
  identified person's usage. See Section 17.

---

## 15. Technical Architecture — Hackathon

**Decision (v0.2):** Detection, sanitisation and policy evaluation all run **inside the extension**. The only data that leaves the browser towards AI Guard is the audit event (FR-10).

**Decision (v0.3):** The policy service is no longer read-only. It also serves the signed-in user's own exceptions and accepts writes from the cockpit. Fetching "my exceptions" identifies the user to the service — that is a read of an access-management record, not a usage log, and it must not be allowed to become one.

```text
┌──────────────────────────────────────────────────────────┐
│                    Employee Browser                      │
│                                                          │
│  ChatGPT / Claude / Gemini                               │
│          │                                               │
│          ▼                                               │
│  ┌────────────────────────────────────────────┐          │
│  │ Finnova AI Guard Extension                 │          │
│  │                                            │          │
│  │  Intercept submit ─► Detect                │          │
│  │                    ─► Policy Engine        │          │
│  │                       + suppress policies  │          │
│  │                         under exception    │          │
│  │                    ─► Sanitise, explain    │          │
│  └───┬──────────┬────────────────▲────────────┘          │
│      │ audit    │ append         │ rules, registry,      │
│      │ event    ▼                │ my exceptions         │
│      │   ┌──────────────┐        │                       │
│      │   │ My history   │        │  never leaves         │
│      │   │ local only   │──┐     │  the browser          │
│      │   └──────────────┘  │     │                       │
└──────┼─────────────────────┼─────┼───────────────────────┘
       ▼                     │     │
┌───────────────┐            │     │
│ Audit Log     │            │     │   ┌──────────────────┐
│ pseudonymous  │            │     └───│ Policy Service   │
│ metadata only │            │         │ rules, registry, │
└───────┬───────┘            │         │ exceptions,      │
        │ aggregates         │         │ requests         │
        ▼                    ▼         └────────▲─────────┘
┌───────────────────────────────────┐           │
│         AI Guard Cockpit          │───────────┘
│ Governance view │ Employee view   │  read + write
│ (aggregates)    │ (own data only) │
└───────────────────────────────────┘
```

The sanitised prompt goes from the extension to the AI provider as it would without AI Guard.

The employee's history never reaches a server. Because the cockpit is a web
application and the history lives in extension storage, the extension supplies it
to the Employee view on the cockpit's own first-party origin. The alternative —
rendering the Employee view inside the extension itself — is noted in the cockpit
design notes; it is simpler but splits the product into two user interfaces.

---

## 16. Production Evolution

The browser extension is an effective hackathon proof of concept, but a production solution would likely use several enforcement points.

| AI Usage | Potential Enforcement Point |
|---|---|
| Browser-based AI | Managed browser / browser extension / secure web gateway |
| AI APIs | Central AI/API gateway |
| IDE AI assistants | IDE extension / enterprise policy |
| Microsoft 365 Copilot | Microsoft security and DLP controls |
| Approved AI services | SSO / IAM / enterprise allow list |
| Documents | Information classification / DLP |

Production capabilities not in the prototype:

- automatic classification from document labels and source context,
- role- and use-case-based rules,
- tool-owner alerting when a vendor changes hosting, training or retention terms (persona 6.3),
- enforcement that cannot be circumvented by disabling a browser extension,
- four-eyes approval and staged rollout for policy changes,
- shadow mode and replay of a candidate rule against historical events (FR-21),
- exception renewal and expiry notifications through existing channels,
- a signed, tamper-evident policy distribution channel, since by then the policy set is a control that an attacker would want to modify.

The long-term product should therefore be considered an **AI Governance Control Layer**, not a browser-extension product.

---

## 17. Security and Privacy Principles

AI Guard itself must follow strict security principles.

### Minimal Data Retention

- Do not store prompts. Not by default, not on BLOCK.
- Store only the metadata required for auditing (FR-10).
- Never log detected values or the pseudonymisation mapping.

### Local Detection

Sensitive-data detection and sanitisation run inside the extension, before content leaves the browser. No AI Guard backend receives prompt content.

### Employees Are Not Monitored

Logging every prompt decision per employee would amount to behaviour monitoring, which Swiss labour law restricts (Art. 26 ArGV 3). Therefore:

- audit events carry a pseudonymous user ID,
- governance reporting shows aggregates only, with no per-user view and no drill-down from an aggregate to the individuals behind it,
- re-identification of a user requires a documented GRC procedure (for example, a security incident),
- ALLOW events carry no content-related fields.

### Three Stores, Three Purposes

**Decision (v0.3):** The Employee view needs a per-user history; the paragraph above forbids a per-user server-side log. Both hold, because the data lives in three separate places with different owners.

| | Audit log | Personal history | Governance records |
|---|---|---|---|
| Purpose | Governance evidence, aggregates | Transparency for the individual | Access management, attribution |
| Location | Server | The employee's browser | Server |
| Names the user | No, pseudonymous | Yes — to that user, on that device | Yes |
| Readable by governance | Aggregated only | Never | Yes |
| Contents | Decision metadata | Decision metadata | Exceptions, requests, policy changes |
| Retention | Per governance policy | Bounded window, user can clear | Until expiry plus audit period |

The personal history stays in the browser. The server therefore never holds an identifiable record of who prompted what and when — not as a matter of access control that could be reconfigured later, but because the record does not exist.

The alternative, a server-side personal history readable only by its subject, was rejected. It places the data within the employer's technical reach and reduces the monitoring promise to a configuration setting. The cost of the chosen design is that history is per-device and disappears when browser storage is cleared. That trade is the right way round, and it gives a data subject access request a simple and honest answer.

### Exceptions Are Identified — and That Is Not Monitoring

An exception names the employee. So does a request. These are access-management records: the documented result of something a person asked for and an approver granted, no different in kind from any other access right in the bank. Behaviour logging serves a different purpose, and the two are kept in different stores so the distinction cannot quietly erode.

No exception may be enforceable against a person while being hidden from them (FR-17).

### Explainability

Every block or transformation should be traceable to a policy.

Example:

```text
Policy triggered:
CH-AI-PII-01
```

### Policy Versioning

Every decision is linked to the policy version and tool-registry version used at the time of evaluation.

---

## 18. Success Metrics

### North Star

**Time to Safe AI Use**

Target vision:

> **Approach zero for routine AI usage.**

### Product Metrics

- percentage of AI interactions requiring no manual governance decision,
- percentage of unsafe interactions automatically made safe,
- number of blocked prohibited interactions,
- reduction in governance clarification requests,
- reduction in manual AI-tool approval questions,
- policy false-positive rate (measured via FR-14 restorations),
- policy false-negative rate,
- average intervention latency (target: ALLOW under 200 ms, MAKE SAFE under 500 ms),
- employee satisfaction with AI usage,
- ARB/GRC effort per governed interaction,
- time from a block to a governance decision on the resulting request,
- share of blocks that lead to a request rather than to abandonment or a workaround,
- number of active exceptions and share expiring without renewal, as a measure of whether exceptions are a safety valve or a slow policy rewrite,
- time from a governance member editing a rule to enforcement points applying it.

### Hackathon Success

The prototype is successful if judges can see, live, that:

1. an employee can remain in an existing AI tool,
2. safe usage passes without visible delay (Scenario 1),
3. unsafe but fixable usage is automatically made safe and the answer is still usable (Scenario 2),
4. prohibited usage is technically blocked (Scenario 3),
5. a wrong-tool case ends in a safe alternative (Scenario 4),
6. GRC sees all four events on the dashboard within seconds,
7. every intervention shows the governance rule ID it came from,
8. a block turns into a request, a decision and changed enforcement without leaving the product (Scenario 5),
9. an employee can answer "what may I use for this data?" by looking, in seconds.

---

## 19. Key UX Principles

### 1. Invisible by Default

If an interaction is safe, do not interrupt the user.

### 2. Enable Before Blocking

If AI Guard can make an interaction safe automatically, do so.

### 3. Explain Interventions

Avoid generic error messages.

Bad:

> Not allowed.

Better:

> A production credential was detected. It cannot be sent to this AI service.

### 4. Stay in the Workflow

Do not force employees into another portal unless necessary.

### 5. Safe Alternative

Whenever possible, tell users how they **can** achieve their goal safely.

### 6. Let Users Correct Mistakes

A detector that is wrong and cannot be corrected teaches users to switch the extension off. Non-critical false positives can be restored in place (FR-14).

### 7. The Cockpit Is a Destination, Not a Detour

Routine AI usage must never require opening the cockpit. It is where people go to
look something up, ask for something, or change something — not a checkpoint on
the way to a prompt.

### 8. Show People Their Own Data, and Nobody Else's

An employee can see everything AI Guard decided about them. Nobody else can. A
system that watches people without showing them what it saw does not get trusted,
and a system that shows their colleagues instead does not deserve to be.

---

## 20. Pitch Positioning

### Problem

> AI governance today is largely based on employees understanding and correctly applying rules.

### Insight

> We do not expect employees to interpret firewall rules before opening a website. Why should we expect them to interpret AI governance before every prompt?

### Solution

> **Finnova AI Guard turns AI governance into an enforcement layer.**

### Product Promise

> **Use AI where you want. Governance follows you.**

### Paradigm Shift

> **From governance as documentation to governance as infrastructure.**

### North Star

> **Time to Safe AI Use → Zero**

---

## 21. Suggested Hackathon Pitch Flow

### 1. Hook

> Imagine we handled cybersecurity the way we handle AI governance today.

> Before visiting a website, every employee would need to read the firewall policy and decide whether the connection is safe.

> We do not do that. The system protects us.

> **So why should AI governance be different?**

### 2. Problem

Employees need to understand:

- which tool is allowed,
- which data is allowed,
- which rules apply,
- whether approval is needed.

### 3. Vision

> **Use AI where you want. Governance follows you.**

### 4. Live Demo

1. Safe prompt → passes silently.
2. Personal data → automatically sanitised, answer still readable.
3. API key → blocked.
4. Confidential data in the wrong tool → blocked with an approved alternative.
5. Request access from the block → approve it in the governance view → retry succeeds under a 30-day exception.
6. Employee view: "here is what I may use, here is what the system decided about me."
7. Governance view: all events visible, aggregated, with no way to see who did what.

Step 7 is worth saying out loud. The thing the dashboard *cannot* do is a
feature, not a gap.

### 5. Architecture

Show:

```text
Existing AI Tools
      ↓
Finnova AI Guard
      ↓
Policy Engine
      ↓
ALLOW / MAKE SAFE / BLOCK
```

### 6. Closing

> The challenge asks how an employee can know within two minutes whether AI can safely be used.

> **Our answer: the employee should not have to find out.**

> If AI Guard lets it through, the applicable automated governance checks have already been performed.

---

## 22. Open Questions

1. Which AI tools can technically be intercepted or governed centrally?
2. Which Finnova data classifications can reliably be detected automatically, so that the user-declared classification (Section 9) can be replaced?
3. Which policy decisions can be fully automated and which must remain human decisions?
4. Is the FR-14 restore path acceptable to GRC, and which detector classes should be excluded from it beyond credentials and special categories?
5. Should users be able to request exceptions directly from an intervention, via the Cockpit request flow (Section 25)?
6. Does the audit model in Section 17 satisfy the data protection officer, in particular the pseudonymisation and re-identification procedure?
7. How should AI Guard integrate with the existing AI Allow List? Is the tool registry (FR-12) the allow list, or derived from it?
8. Which existing Finnova security technologies could provide enforcement points?
9. Can approved tool metadata be maintained centrally by ARB/GRC?
10. Which rules should be enforced at browser, network, API gateway, endpoint or SaaS level?
11. Is browser-local personal history acceptable to the data protection officer as the answer to a data subject access request, or is a server-side record required — which would reopen the monitoring question (Section 17)?
12. Who may grant an exception, and does a bank-grade control require four eyes rather than one approver?
13. What is the maximum exception duration, and what happens to work that depends on an exception when it expires?
14. Should a policy change require four-eyes approval before it reaches enforcement points?
15. Which identity group owns the governance view, and is CISO, ARB and GRC really one permission level?

---

## 23. Source Constraints from Finnova AI Governance

The concept is based on the Finnova AI Governance material provided for the hackathon.

**Source to cite:** _[document title, version and date to be filled in; the `policy_version` value in audit events should reference it]_.

Important constraints incorporated into this PRD include:

- AI usage should be efficient and effective while risks are known, assessed and controlled.
- Different approval requirements apply depending on data classification.
- Technical requirements include permitted hosting regions, restrictions on training with Finnova data, data-retention requirements, access controls, RBAC and tenant isolation.
- Employees remain responsible for reviewing AI-generated output regarding quality, correctness and risks.
- Responsibility for the content, quality and use of AI output remains with the employee.
- Governance should enable safe AI usage rather than merely act as a barrier.

---

## 24. One-Sentence Product Definition

> **Finnova AI Guard is an AI governance enforcement layer that lets employees use AI in their preferred tools while automatically allowing, sanitising or blocking interactions according to Finnova policies — with a cockpit where governance owns the rules and employees can see, and extend, what they are allowed to do.**

---

## 25. Relationship to the Finnova AI Cockpit and Regula

This repository also contains the [Finnova AI Cockpit and Regula PRD](finnova-pet-prd.md). The two concepts are complementary and, if pitched together, should use one vocabulary.

**Naming collision, unresolved.** Both products now have something called a cockpit. If they are pitched together, one of them has to be renamed — "AI Guard Cockpit" and "Finnova AI Cockpit" in the same presentation will lose the audience within a minute. This PRD does not decide which; it just refuses to pretend the problem is not there.

**Decision (v0.3), to be confirmed:** ownership of the request flow moves to AI Guard. A request originates in an enforcement decision, carries that decision as its context, and produces an exception the enforcement layer consumes. Splitting the intake from the enforcement point would mean rebuilding that context on the other side.

| Concern | Owner |
|---|---|
| Enforcement at the point of use (ALLOW / MAKE SAFE / BLOCK) | AI Guard |
| Request intake from an intervention, and the resulting exception | AI Guard (changed in v0.3) |
| Broader access requests, approvals and sign-offs unrelated to an AI interaction | Finnova AI Cockpit |
| Rule catalogue and rule IDs (`CH-<area>-<nn>`, rule pack `banking-ch`) | Shared; AI Guard rules use the `CH-AI-*` range |
| Event feed that Regula mirrors | Finnova AI Cockpit; AI Guard audit events can be published to the same feed as "protected" events, without content |
| Audit and aggregate reporting on AI interactions | AI Guard |

Where the Finnova AI Cockpit exists in production, AI Guard should hand the approved outcome to it rather than run a second approval workflow. What AI Guard must keep is the intake and the enforceable result.

Terminology alignment:

- Cockpit "rule" = AI Guard "policy". This PRD keeps "policy" in prose and uses the shared ID scheme.
- Cockpit "protected an item" corresponds to an AI Guard MAKE SAFE event.
- "Request access" from a BLOCK (8.3) now opens the AI Guard request flow (FR-18), not the other product's.
