# Product Requirements

| Document | Working title | Status |
|---|---|---|
| [finnova-ai-guard-prd.md](finnova-ai-guard-prd.md) | Finnova AI Guard — AI Governance Enforcement Layer | Hackathon concept, v0.2 |
| [finnova-pet-prd.md](finnova-pet-prd.md) | Finnova AI Cockpit and Regula (regula.dot) | Hackathon POC in `regula/` |

## Conventions

- File names in kebab-case, ending in `-prd.md`.
- Policy and rule IDs follow the shared scheme `CH-<area>-<nn>`; AI Guard owns
  the `CH-AI-*` range.
- Decision outcomes are written `ALLOW`, `MAKE_SAFE`, `BLOCK` in code, events
  and rules; in prose "ALLOW", "MAKE SAFE", "BLOCK".

## Where requirements live

The PRD owns the **why**: the problem, the product decisions and their rationale,
and the priorities. Binding **requirements and acceptance scenarios** for the
cockpit live in OpenSpec, not here:

```text
openspec/changes/add-ai-guard-cockpit/
```

One requirement, one source. When the two disagree, the spec wins and the PRD
gets corrected.

