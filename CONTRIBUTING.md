# Contributing

12 hours. Keep the process light, keep the demo working.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Always demo-ready. Never push broken code here. |
| `feat/<short-name>` | One feature or workstream per person |
| `docs/<short-name>` | PRDs, pitch material, diagrams |

## Workflow

```bash
git switch main && git pull
git switch -c feat/policy-engine
# work
git add -A && git commit -m "Add policy engine precedence"
git push -u origin feat/policy-engine
```

Open a PR against `main`. During the hackathon a quick look by one teammate is
enough — do not block on formal review.

## Commit messages

Imperative mood, one line, no ticket prefixes:

```
Add IBAN detector
Fix false positive on product names
```

## Rules of thumb

- The demo path is sacred. If a change risks it, branch it.
- Never commit real credentials or real customer data — this project is *about*
  that. `.gitignore` covers `.env` and key files; check `git diff --staged`
  before committing.
- Keep PRDs in `docs/prd/`, pitch assets in `docs/pitch/`.
