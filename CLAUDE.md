# HackLenzburg2026

Finnova Hackathon 2026 (12 hours, 18 Sep 2026). Process: `CONTRIBUTING.md`.

## Project

Regula, the pink full stop of the finnova logo as a menu-bar dot (default) and an opt-in desktop companion for the Finnova AI Cockpit. macOS only for the POC. PRD: `docs/finnova-pet-prd.md`. The app lives in `regula/` (Tauri 2 shell in Rust, Vite + TypeScript frontend, no framework, inline SVG rig of the pink finnova full stop with a face in `regula/src/rig.ts`, animated with CSS). The cockpit web app is not in this repo; Regula only consumes its event feed.

The repo also holds **Finnova AI Guard**, a browser extension that decides `ALLOW` / `MAKE_SAFE` / `BLOCK` before a prompt leaves the browser. Spec: `docs/prd/finnova-ai-guard-prd.md`. Detection and policy evaluation run inside the extension; no backend receives prompt content. Rule IDs follow `CH-AI-<nn>`.

## Commands

Run from `regula/`:

- `npm install` once
- `npm start` runs the Tauri app with the scripted mock feed
- `npm run dev` browser preview on http://localhost:1420
- `npm test` state-machine replay test (esbuild + node)
- `npm run typecheck`, `npm run build`
- `npm run poses` regenerates the static pose sheet in `regula/docs/`

Rust toolchain is pinned in `regula/src-tauri/rust-toolchain.toml`; the global default toolchain is too old for Tauri 2.11.

## Conventions

- The state machine (`regula/src/state.ts`) is the only thing that talks to the feed; views render the model and open deep links, nothing else.
- Regula never displays values, client names or conversation text. Event types in `regula/src/types.ts` have no field for them; keep it that way.
- All user-facing words live in `regula/src/strings.ts` (EN and DE), max 12 words, no emoji.
- Brand colors and fonts only via `regula/src/tokens.css`.
- The menu-bar dot is drawn in Rust (`dot_icon` in `src-tauri/src/main.rs`) from the pose the web view reports via `set_tray_state`; the companion window starts hidden and follows the persisted `desktop` setting.
- Poses are switched via `data-state` on the SVG root; motion rules: 300 ms ease-out transitions, no bounce over 4 px, no rotation over 8 degrees, reduced-motion drops loops.
- Never commit credentials or real customer data. Do not commit unless asked.

## Working in this repo (cost and context hygiene)

These apply the levers in `.claude/optimizations/claude-cost-optimization-summary.json`.

- **Keep this file stable and short.** It is part of every request's cached prefix.
  Do not edit it mid-task; append changes at task boundaries. Details belong in
  `docs/`, not here.
- **Do not change effort or system context mid-task.** Set effort once per task.
  Routine edits, docs, and lookups run fine at low effort; reserve high effort for
  multi-file coding or debugging. Retry a failed attempt at higher effort instead of
  running everything high.
- **Trim input.** Read only the part of a file you need. Do not dump large files,
  search results, or the full PRD into context; grep for the section. Prune stale
  tool results at task boundaries rather than mid-task.
- **Short output.** Lead with the outcome, no restating of the request, no closing
  offers. Output tokens cost ~5x input and re-enter context on every later turn.
- **No legacy prompting.** Do not add "verify twice", forced step-by-step, or
  hand-rolled scratchpad instructions to prompts, skills, or tool descriptions.
- **Delegate wide searches** to a subagent at low effort and keep only the conclusion.

## Any Claude API code in this project

- Default model `claude-opus-5`; `claude-haiku-4-5` for high-volume, easily checked
  work (e.g. bulk classification in evals). Compare on cost per completed task.
- Adaptive thinking (`thinking: {type: "adaptive"}`), no `budget_tokens`, no prefill.
  Control cost with `output_config.effort`, starting at `low` and measuring.
- **Prompt caching first.** Order requests `tools` -> `system` -> `messages`, keep
  stable content first, add `cache_control` breakpoints, never put timestamps or
  per-request IDs in the prefix, never reorder tools. Verify
  `usage.cache_read_input_tokens` is non-zero; target >80% cache hit rate.
- Large inputs (rule sets, CSVs, logs) go through the Files API and code execution,
  not inline in the prompt. Defer unused tool definitions with tool search.
- Non-interactive work (evals, backfills, scheduled jobs) uses the Message Batches
  API for 50% off all tokens.
- Ask for the shortest output format that works (structured outputs, short JSON).
- Set `max_tokens` generously (16k non-streaming, 64k streaming); it is a safety cap.
  Use a task budget (`output_config.task_budget`, min 20k) when a loop should pace itself.
- Do not add multi-model advisor or orchestrator patterns unless a single model at
  tuned effort has been measured and still leaves a gap.
