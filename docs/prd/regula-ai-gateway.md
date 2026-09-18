# Regula AI Gateway — Governance as Infrastructure

> **The same three outcomes — ALLOW, MAKE SAFE, BLOCK — but for every app, agent and API, not just the browser.**

**Status:** Hackathon concept extension · complements [Finnova AI Guard](finnova-ai-guard-prd.md)
**Product type:** AI Gateway / enforcement point for the Regula governance layer
**High-level architecture:** [`../pitch/regula-ai-gateway.html`](../pitch/regula-ai-gateway.html) (interactive, presentation-ready)
**Device enforcement:** [`../pitch/regula-ai-gateway-enforcement.html`](../pitch/regula-ai-gateway-enforcement.html) (how the gateway gets in the middle)

---

## 1. What it is, in one sentence

> **The Regula AI Gateway is a single reverse-proxy in front of every AI model that
> routes all AI traffic through Finnova's policy engine — allowing, sanitising or
> blocking each call — so governance is enforced by infrastructure, not by people.**

AI Guard proves the idea at the **point of use** (a browser extension). The Regula
AI Gateway proves the same idea at the **point of exit** (the network). Together they
are the two enforcement points named in AI Guard PRD §16: *"Browser-based AI →
extension"* and *"AI APIs → central AI/API gateway."* Same rules, same decisions,
same audit — a different chokepoint.

## 2. Why a gateway, and why now

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

| Standard LLM gateway | Regula AI Gateway (Finnova) |
|---|---|
| Unified API across providers | ✅ Same — one OpenAI-compatible endpoint |
| Routing, fallback, caching, cost control | ✅ Same — operational hygiene |
| Guardrails as an optional add-on | ⭐ **Core** — the `CH-AI-*` policy engine is mandatory and inline |
| Observability of tokens & latency | ⭐ **Governance audit** — metadata-only, ARB/GRC-facing, Swiss-labour-law safe |
| "Which model is cheapest?" | ⭐ **"Is this call allowed at all, and for this data class?"** |

## 3. How a request flows

Follow one call through the gateway (mirrors the diagram left → right):

1. **Any channel calls one endpoint.** An employee's browser, an internal app, a
   Copilot, an autonomous **agent** (MCP), or a nightly **batch job** all send their
   request to a single, OpenAI-compatible URL. There is no direct network path from a
   Finnova workload to `api.openai.com` — the gateway is the only door.
2. **Identity & tool context.** The request is authenticated (SSO / service identity)
   and the target AI service + data classification are resolved from the request and
   the **tool registry** (`allowed_data`, hosting region, training terms, RBAC).
3. **Policy engine — the decision.** The exact same engine as AI Guard evaluates the
   shared `CH-AI-*` rule pack and returns the most-restrictive outcome:
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
   ARB / GRC see aggregates in the Governance Cockpit; individual employees are not
   monitored. Events are published to the same feed Regula mirrors.

## 4. "Wherever the employee runs AI" — how the gateway gets in the middle

> **See [`../pitch/regula-ai-gateway-enforcement.html`](../pitch/regula-ai-gateway-enforcement.html).**

The employee should not have to route anything by hand. It should not matter whether
AI is used from an **IDE assistant**, a **browser**, or a **dedicated desktop app** —
if it runs on a Finnova-managed machine, the gateway is unavoidably in the path. This
is achieved at the **network layer**, not per application:

1. **The device is managed.** MDM (Microsoft Intune / Jamf) enrols the laptop and
   pushes configuration the user cannot remove.
2. **All AI-bound traffic is forced to the gateway.** An **always-on VPN** or a
   **system-wide forward proxy (PAC file)** is pushed by MDM. Every outbound
   connection to a known AI provider is transparently sent to the Regula AI Gateway —
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
5. **The browser keeps its second layer.** AI Guard still runs in the browser as an
   in-page enforcement point (better UX, in-context explanations), while the gateway
   guarantees coverage for everything else on the machine.

> **Rule of thumb:** *The browser extension makes governance pleasant; the device
> gateway makes it unavoidable.*

The user's mental model is exactly right: **it behaves like a company VPN setting** —
except instead of only routing traffic, that tunnel also enforces AI policy on the way
out. For server-side workloads (agents, CI/CD, batch) the same gateway is reached by
service identity instead of a device VPN, so the *"one governed path"* holds there too.

## 5. What the gateway adds over the browser extension

- **Coverage the browser can't reach.** Server-to-server calls, agent tool-use,
  CI/CD, and batch pipelines never touch a browser — the gateway governs them.
- **Cannot be switched off by the user.** It is a network control, not a client
  add-on. This closes the main circumvention gap listed in AI Guard §5 (Non-Goals).
- **One catalogue, two enforcement points.** Rules (`CH-AI-*`), the tool registry and
  the policy version are shared, so a rule change lands in the browser *and* on the
  wire at the same time. No divergence between "what the policy says" and "what
  actually happens."
- **Provider abstraction & resilience.** Swap or fail over models centrally; add a
  sovereign model without touching a single application.

## 6. The one-line pitch (for the 90-second video)

> **"We put a single gateway in front of every AI model. Nothing reaches a model
> uninspected. Every call is allowed, made safe, or blocked — automatically, by the
> same rules, whether it comes from a browser, an app, an agent or an API."**
>
> **Governance stops being a document people must remember. It becomes infrastructure
> every request has to pass through.**

---

### Suggested 3-beat visual walk-through (using the diagram's guided views)

1. **"Every channel, one path"** — fan-in from Employees / Apps / Agents & Jobs into
   the single endpoint. *No side doors.*
2. **"The decision"** — the gateway pipeline lights up: inspect → ALLOW / MAKE SAFE /
   BLOCK. *Same engine as AI Guard.*
3. **"Providers & evidence"** — route with fallback to OpenAI / Anthropic / Gemini /
   sovereign, and the metadata-only audit trail flowing to ARB · GRC · Regula.
