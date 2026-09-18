# Product Requirements

| Document | Working title | Status |
|---|---|---|
| [finnova-ai-guard-prd.md](finnova-ai-guard-prd.md) | Finnova AI Guard — AI Governance Enforcement Layer | Hackathon concept, v0.2 |
| `finnova-pet-prd.md` | Finnova AI Cockpit and Regula | Not yet in repo |

> Section 25 of the AI Guard PRD links to `finnova-pet-prd.md`. That file is not
> in the repository yet — drop it in this folder under exactly that name and the
> cross-reference resolves.

## Conventions

- File names in kebab-case, ending in `-prd.md`.
- Policy and rule IDs follow the shared scheme `CH-<area>-<nn>`; AI Guard owns
  the `CH-AI-*` range.
- Decision outcomes are written `ALLOW`, `MAKE_SAFE`, `BLOCK` in code, events
  and rules; in prose "ALLOW", "MAKE SAFE", "BLOCK".
