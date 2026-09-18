# PRD — Finnova AI Guard

As of 2026-09-18 · Elena Kuprienko · v0.2 (after audit)

**Status:** Hackathon Concept  
**Working Title:** Finnova AI Guard  
**Product Type:** AI Governance Enforcement Layer  
**Primary Users:** Finnova employees, AI Review Board (ARB), GRC, AI tool owners  
**North Star:** **Time to Safe AI Use → Zero**  
**Related documents:** [Finnova AI Cockpit and Regula PRD](finnova-pet-prd.md) (see Section 25)

> Paragraphs marked **Decision (v0.2)** record choices made while resolving the audit findings. They are proposals and can be overruled.

---

## 1. Executive Summary

Finnova AI Guard is a governance enforcement layer that allows employees to use AI in the tools they already prefer while automatically applying Finnova's AI governance rules in the background.

The core idea is simple:

> **Employees should not have to interpret AI governance. Governance should be enforced by the system.**

Today, safe AI usage requires employees to understand which tools are approved, which data may be used, which restrictions apply, and when an approval is required. This creates friction, uncertainty and the risk of incorrect interpretation.

AI Guard moves governance from documentation into infrastructure.

Employees continue to work in the AI tools they already use. AI Guard evaluates the interaction before sensitive content is sent to the AI provider and decides whether the interaction can proceed, needs to be modified, or must be blocked.

The hackathon prototype governs browser-based AI tools (ChatGPT, Claude, optionally Gemini) through a browser extension. Copilot, IDE assistants and API usage are part of the production vision (Section 16), not of the prototype.

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

### Hackathon Goal

Demonstrate with a working prototype that Finnova AI Governance can be translated into an automated enforcement layer with three outcomes:

- **ALLOW**
- **MAKE SAFE**
- **BLOCK**

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

---

## 6. Users and Personas

### 6.1 Employee

**Need:** Use AI productively without studying governance documentation.

**Desired experience:**

- use preferred AI tools,
- receive no interruption when usage is safe,
- receive an understandable explanation when AI Guard intervenes,
- automatically receive a safer alternative where possible,
- be able to correct AI Guard when it is wrong about non-critical content (see FR-14).

---

### 6.2 AI Review Board / GRC

**Need:** Ensure governance rules are applied consistently and auditably.

**Desired experience:**

- see which policies are triggered,
- see blocked or sanitised interactions,
- understand recurring governance issues,
- identify tools or policies requiring reassessment,
- maintain governance rules centrally.

---

### 6.3 AI Tool Owner

**Need:** Understand whether the tool remains compliant with its approved usage.

**Desired experience:**

- see current tool status,
- see applicable policies,
- understand usage patterns and policy violations,
- receive alerts when changes require reassessment (post-hackathon; no functional requirement in this version delivers it, see Section 16).

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

- **a request for approval** when a policy requires prior approval. AI Guard stays with three outcomes; the request itself is handled by the existing request-and-approval flow of the Finnova AI Cockpit (Section 25), and AI Guard only links to it:

  > **This use requires approval. Request access in the Cockpit →**

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

### FR-11 — Governance Dashboard

ARB/GRC should have a dashboard showing aggregated governance activity. The dashboard shows aggregates only; there is no per-user drill-down in this version (Section 17).

Example KPIs:

- AI interactions governed,
- automatically allowed,
- automatically sanitised,
- blocked,
- most frequently triggered policies,
- affected AI tools,
- trends over time.

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

## 12. Hackathon MVP

### MVP Scope

The prototype should demonstrate the concept with:

- 1 browser extension,
- 2–3 AI web tools,
- 3 confidentiality classifications (INTERNAL, CONFIDENTIAL, STRICTLY_CONFIDENTIAL) plus the orthogonal personal-data flag,
- 3 policy outcomes,
- 6 detection patterns plus one keyword list (FR-04),
- 1 policy engine with the six rules of Section 10,
- 1 simple GRC dashboard,
- 1 audit log.

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

## 14. Governance Dashboard

The dashboard is primarily intended for ARB, GRC and AI tool owners — not as the main workplace for employees. It shows aggregates only.

### Example

**AI Governance Control Center**

| Metric | Value |
|---|---:|
| Governed AI interactions | 1,284 |
| Allowed automatically | 1,219 |
| Made safe automatically | 51 |
| Blocked | 14 |
| Open incidents | 1 |

### Triggered Policies

| Policy | Outcome | Events |
|---|---|---:|
| CH-AI-PII-01 Personal Data | MAKE_SAFE | 51 |
| CH-AI-CRED-01 Credentials | BLOCK | 8 |
| CH-AI-CONF-01 Restricted Data Class | BLOCK | 4 |
| CH-AI-TOOL-01 Unapproved Tool | BLOCK | 2 |

(51 sanitised + 14 blocked = 65 intervention events.)

### Tool View

| Tool | Status | Governed Interactions | Blocks |
|---|---|---:|---:|
| ChatGPT | Approved | 624 | 5 |
| Gemini | Approved | 502 | 1 |
| Claude | Restricted | 158 | 8 |

---

## 15. Technical Architecture — Hackathon

**Decision (v0.2):** Detection, sanitisation and policy evaluation all run **inside the extension**. The only data that leaves the browser towards AI Guard is the audit event (FR-10). The policy service is read-only from the extension's point of view and serves the rule set and the tool registry.

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
│  │  Intercept submit ─► Detect (regex,        │          │
│  │                       keyword lists)       │          │
│  │                    ─► Policy Engine        │          │
│  │                       ALLOW / MAKE_SAFE /  │          │
│  │                       BLOCK                │          │
│  │                    ─► Sanitise, explain,   │          │
│  │                       re-identify answer   │          │
│  └───────┬───────────────────────▲────────────┘          │
│          │ audit event           │ rules + registry      │
└──────────┼───────────────────────┼───────────────────────┘
           ▼                       │
   ┌───────────────┐      ┌────────┴────────┐
   │ Audit Log     │      │ Policy Service  │
   │ (metadata     │      │ (rules, tool    │
   │  only)        │      │  registry,      │
   └───────┬───────┘      │  versions)      │
           ▼              └─────────────────┘
   ┌───────────────┐
   │ Governance    │
   │ Dashboard     │
   └───────────────┘
```

The sanitised prompt goes from the extension to the AI provider as it would without AI Guard.

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
- enforcement that cannot be circumvented by disabling a browser extension.

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
- the dashboard shows aggregates only, with no per-user view,
- re-identification of a user requires a documented GRC procedure (for example, a security incident),
- ALLOW events carry no content-related fields.

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
- ARB/GRC effort per governed interaction.

### Hackathon Success

The prototype is successful if judges can see, live, that:

1. an employee can remain in an existing AI tool,
2. safe usage passes without visible delay (Scenario 1),
3. unsafe but fixable usage is automatically made safe and the answer is still usable (Scenario 2),
4. prohibited usage is technically blocked (Scenario 3),
5. a wrong-tool case ends in a safe alternative (Scenario 4),
6. GRC sees all four events on the dashboard within seconds,
7. every intervention shows the governance rule ID it came from.

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
5. Governance dashboard → all four events visible.

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

> **Finnova AI Guard is an AI governance enforcement layer that lets employees use AI in their preferred tools while automatically allowing, sanitising or blocking interactions according to Finnova policies.**

---

## 25. Relationship to the Finnova AI Cockpit and Regula

This repository also contains the [Finnova AI Cockpit and Regula PRD](finnova-pet-prd.md). The two concepts are complementary and, if pitched together, should use one vocabulary.

**Decision (v0.2), to be confirmed:**

| Concern | Owner |
|---|---|
| Enforcement at the point of use (ALLOW / MAKE SAFE / BLOCK) | AI Guard |
| Requests for access, approvals, sign-offs | Cockpit |
| Rule catalogue and rule IDs (`CH-<area>-<nn>`, rule pack `banking-ch`) | Shared; AI Guard rules use the `CH-AI-*` range |
| Event feed that Regula mirrors | Cockpit; AI Guard audit events can be published to the same feed as "protected" events, without content |
| Audit and dashboard | AI Guard (aggregates); Cockpit keeps its own request audit |

Terminology alignment:

- Cockpit "rule" = AI Guard "policy". This PRD keeps "policy" in prose and uses the shared ID scheme.
- Cockpit "protected an item" corresponds to an AI Guard MAKE SAFE event.
- "Request approval" from a BLOCK (8.3) opens the Cockpit request flow rather than a new mechanism.
