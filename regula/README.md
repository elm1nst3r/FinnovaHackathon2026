# Regula, the Finnova desktop pet (POC)

Regula is the pink full stop from the finnova logo with a face. It sits on a finnova employee's desktop and mirrors the state of the Finnova AI Cockpit. This is the hackathon proof of concept described in [docs/finnova-pet-prd.md](../docs/finnova-pet-prd.md).

## Run

```sh
npm install
npm start            # Tauri window with the scripted mock feed (same as --mock)
npm run dev          # browser preview at http://localhost:1420 (no tray, no drag)
npm test             # replays Mira's story through the state machine
npm run poses        # regenerates docs/poses.svg, the static pose sheet
```

Flags for the built binary: `--mock`, `--cockpit https://host`, `--lang de`. Environment: `REGULA_COCKPIT_URL`, `REGULA_LANG`. With no cockpit URL the mock feed is used.

Rust: `src-tauri/rust-toolchain.toml` pins a current stable toolchain (Tauri 2.11's dependencies need Rust ≥ 1.85).

## Demo controls (mock feed only)

| Key | Action |
| --- | --- |
| Space | next step of the story |
| R | restart the story |
| O | toggle offline |
| P | pause / resume reactions |
| Esc | close card, dismiss bubble |

The menu-bar dot changes with the state (solid pink idle, breathing while working, hollow while pending, badges for protected / granted / declined / sign-off, muted pink offline or paused) and shows a count of items waiting on you. Its menu offers the desktop companion (off by default, remembered), open cockpit, pause for 1 h, click-through and quit.

On the desktop: hover Regula for the card, click to pin it, drag to move it. "Top bar only" in the card hides it again.

## Layout

```
src/state.ts        state machine: model, reducer, pose derivation, timers
src/feed.ts         MockFeed (scripted) and SseFeed (GET /api/pet/state + /api/pet/events)
src/mock-script.ts  Mira's story: working → CH-ID-01 → IBAN request → granted → sign-off → declined set
src/rig.ts          the SVG rig (pink disc with a navy face); poses switched via data-state
src/styles.css      pose animations, card, bubble
src/tokens.css      cockpit design tokens (re-skin here)
src/strings.ts      every word Regula says, EN and DE
src/card.ts         counters, pending list, deep-link buttons
src/bubble.ts       speech bubble
src/tauri.ts        bridge to the Rust shell with a browser fallback
src-tauri/          Tauri 2 shell: menu-bar dot drawn per state, tray menu, hidden-by-default companion window, settings.json
```

## What the POC covers

P0 from the PRD: F1 (menu-bar dot first; the companion window is transparent, frameless, always on top, draggable, position remembered, click-through via tray, opt-in), F2 for the mock feed plus an SSE client with back-off for the real one, F3 all nine poses, F4 the card, F5 the tray, F6 bubbles. From P1: German strings and the approver queue in the model and card.

Not in the POC: device-token auth and keychain, native OS notifications, nudges, settings, signed installers, sound.
