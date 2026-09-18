# Regula — Governed AI on Every Surface

> **Use AI where you want. Governance follows you.** The same three outcomes —
> ALLOW, MAKE SAFE, BLOCK — applied to every browser, IDE, desktop app, agent and API.

**Status:** Hackathon concept · supersedes the "browser-extension only" framing of [Finnova AI Guard](finnova-ai-guard-prd.md)
**Product type:** AI governance suite — an on-device companion, a control cockpit and an enforcing gateway
**High-level architecture:** [`../pitch/regula-ai-gateway.html`](../pitch/regula-ai-gateway.html) (interactive, presentation-ready)
**Device enforcement:** [`../pitch/regula-ai-gateway-enforcement.html`](../pitch/regula-ai-gateway-enforcement.html) (how the gateway gets in the middle)

---

## 1. What Regula is — three components

Regula is **no longer a browser extension**. It is a governance suite made of three
parts that share one policy catalogue (`CH-AI-*`) and one vocabulary:

| Component | What it is | What it does |
|---|---|---|
| **Regula Dot** | The on-device companion (evolves the old AI Guard extension into a system-wide helper) | Follows the user across tools; provides guidance, collects inputs (e.g. the data classification), and explains every decision in context |
| **Regula Cockpit** | The central control plane | **Defines the policies** that the Gateway enforces, and is where each user reviews **their rights, approved tools and their own history**; ARB / GRC governance views live here too |
| **Regula Gateway** | The AI Gateway (enforcement point) | Routes every AI call through the policy engine and returns **ALLOW · MAKE SAFE · BLOCK** before anything reaches a provider |

> **Cockpit defines. Gateway enforces. Dot guides.**

Policy is authored **once** in the Cockpit, enforced on **every** call by the Gateway,
and surfaced to the employee **in place** by Dot. The rest of this document details the
Gateway, because it is the piece that makes the guarantee technical.

## 2. The Gateway, in one sentence

> **The Regula Gateway is a single reverse-proxy in front of every AI model that
> routes all AI traffic through Finnova's policy engine — allowing, sanitising or
> blocking each call — so governance is enforced by infrastructure, not by people.**

Regula Dot proves the idea at the **point of use** (on the device, next to the user).
The Regula Gateway proves the same idea at the **point of exit** (the network). Same
rules, same decisions, same audit — a second, unavoidable chokepoint.

## 3. Why a gateway, and why now

The market has converged on a pattern: as soon as a company uses more than one model,
teams put a **gateway** between their applications and the providers (Vercel AI
Gateway, Kong AI Gateway, Cloudflare AI Gateway, Portkey, LiteLLM, Orq.ai). A gateway
is not just a proxy — it is *"the place where teams decide which models can be used,
how traffic is routed, what happens when a provider fails, and how usage is
monitored."*

For a bank that is exactly where governance belongs. Finnova does not primarily need
cheaper token routing; it needs **every AI call to be provably compliant before it
leaves the bank**. So we take the standard LLM-gateway shape and make *policy the
first-class citizen*:

| Standard LLM gateway | Regula Gateway (Finnova) |
|---|---|
| Unified API across providers | ✅ Same — one OpenAI-compatible endpoint |
| Routing, fallback, caching, cost control | ✅ Same — operational hygiene |
| Guardrails as an optional add-on | ⭐ **Core** — the `CH-AI-*` policy engine is mandatory and inline |
| Observability of tokens & latency | ⭐ **Governance audit** — metadata-only, ARB/GRC-facing, Swiss-labour-law safe |
| "Which model is cheapest?" | ⭐ **"Is this call allowed at all, and for this data class?"** |

## 4. How a request flows

Follow one call through the gateway (mirrors the diagram left → right):

1. **Any channel calls one endpoint.** An employee's browser, an internal app, a
   Copilot, an autonomous **agent** (MCP), or a nightly **batch job** all send their
   request to a single, OpenAI-compatible URL. There is no direct network path from a
   Finnova workload to `api.openai.com` — the gateway is the only door.
2. **Identity & tool context.** The request is authenticated (SSO / service identity)
   and the target AI service + data classification are resolved from the request and
   the **tool registry** (`allowed_data`, hosting region, training terms, RBAC).
3. **Policy engine — the decision.** The same engine Regula Dot uses on the device
   evaluates the shared `CH-AI-*` rule pack and returns the most-restrictive outcome:
   - **ALLOW** — complies; forwarded untouched (target < 200 ms overhead).
   - **MAKE SAFE** — PII / secrets / tokens are redacted or pseudonymised, then the
     sanitised prompt is forwarded; placeholders are re-identified in the response.
   - **BLOCK** — cannot be made safe (a credential, a wrong-data-class tool, an
     unapproved model). The call is stopped and the caller gets a structured error
     with a **safe alternative** (an approved model, or a Cockpit approval link).
4. **Route, fall back, vault the keys.** For allowed/sanitised traffic the router
   selects the approved provider, applies fallback/retry, and injects the provider
   credential from a **central vault** — so no application ever holds a raw provider
   key. Sovereign / on-prem models are just another route.
5. **Evidence, not surveillance.** Every decision emits a **metadata-only** audit
   event (tool, data class, decision, policy ID + version — never prompt content).
   ARB / GRC see aggregates in the **Regula Cockpit**; individual employees are not
   monitored. The same events feed each user's own history view in the Cockpit.

## 5. "Wherever the employee runs AI" — how the gateway gets in the middle

> **See [`../pitch/regula-ai-gateway-enforcement.html`](../pitch/regula-ai-gateway-enforcement.html).**

The employee should not have to route anything by hand. It should not matter whether
AI is used from an **IDE assistant**, a **browser**, or a **dedicated desktop app** —
if it runs on a Finnova-managed machine, the gateway is unavoidably in the path. This
is achieved at the **network layer**, not per application:

1. **The device is managed.** MDM (Microsoft Intune / Jamf) enrols the laptop and
   pushes configuration the user cannot remove.
2. **All AI-bound traffic is forced to the gateway.** An **always-on VPN** or a
   **system-wide forward proxy (PAC file)** is pushed by MDM. Every outbound
   connection to a known AI provider is transparently sent to the Regula Gateway —
   whether it originates from Cursor, VS Code Copilot, `chat.openai.com` in the
   browser, or the native Claude app. No plugin per tool is required.
3. **TLS is inspected under an enterprise CA.** Because the managed device trusts a
   Finnova root certificate, the gateway can terminate TLS, read the prompt, apply the
   `CH-AI-*` policy, and re-encrypt onward. Unmanaged devices do not trust the CA and
   have no route anyway.
4. **The perimeter fails closed.** The **egress firewall allowlists only the gateway**
   for AI-provider destinations. A direct call from an app to `api.anthropic.com` is
   simply dropped. Off-VPN, off-network or a bypass attempt = **no route to any
   model**. There is no "quiet side door."
5. **Regula Dot rides along.** On the same device, Dot supplies the classification and
   inputs the user declares, and explains each ALLOW / MAKE SAFE / BLOCK in context —
   so the Gateway guarantees coverage while Dot keeps the experience friendly.

> **Rule of thumb:** *Regula Dot makes governance pleasant; the Gateway makes it
> unavoidable.*

The user's mental model is exactly right: **it behaves like a company VPN setting** —
except instead of only routing traffic, that tunnel also enforces AI policy on the way
out. For server-side workloads (agents, CI/CD, batch) the same gateway is reached by
service identity instead of a device VPN, so the *"one governed path"* holds there too.

## 6. What the Gateway adds beyond the on-device Dot

- **Coverage Dot can't reach alone.** Server-to-server calls, agent tool-use,
  CI/CD, and batch pipelines never touch a user device — the gateway governs them.
- **Cannot be switched off by the user.** It is a network control, not a client
  add-on. This closes the main circumvention gap listed in AI Guard §5 (Non-Goals).
- **One catalogue, two enforcement points.** Dot (on device) and the Gateway (on the
  wire) share the Cockpit's `CH-AI-*` rules, tool registry and policy version, so a
  rule change lands in both at once. No divergence between "what the policy says" and
  "what actually happens."
- **Provider abstraction & resilience.** Swap or fail over models centrally; add a
  sovereign model without touching a single application.

## 7. The one-line pitch (for the 90-second video)

> **"We put a single gateway in front of every AI model. Nothing reaches a model
> uninspected. Every call is allowed, made safe, or blocked — automatically, by the
> same rules, whether it comes from a browser, an app, an agent or an API."**
>
> **Governance stops being a document people must remember. It becomes infrastructure
> every request has to pass through.**

---

### Suggested 3-beat visual walk-through (using the diagram's guided views)

1. **"Regula in three parts"** — Dot on the device, the Gateway on the wire, the
   Cockpit defining policy and holding rights & history. *One product, three jobs.*
2. **"Every channel, one path"** — fan-in from the managed device, apps, agents and
   APIs into the single governed endpoint. *No side doors.*
3. **"The decision"** — the gateway pipeline lights up: inspect → ALLOW / MAKE SAFE /
   BLOCK, with policy authored in the Cockpit and evidence flowing back to it.
