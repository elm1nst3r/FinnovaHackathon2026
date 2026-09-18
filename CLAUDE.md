# HackLenzburg2026

## Project

Regula, the pink full stop of the finnova logo as a menu-bar dot (default) and an opt-in desktop companion for the Finnova AI Cockpit. macOS only for the POC. PRD: `docs/finnova-pet-prd.md`. The app lives in `regula/` (Tauri 2 shell in Rust, Vite + TypeScript frontend, no framework, inline SVG rig of the pink finnova full stop with a face in `regula/src/rig.ts`, animated with CSS). The cockpit web app is not in this repo; Regula only consumes its event feed.

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
- Do not commit unless asked.
