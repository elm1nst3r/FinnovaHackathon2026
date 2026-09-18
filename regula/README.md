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
| Esc | dismiss bubble |

The menu-bar dot changes with the state (solid pink idle, breathing while working, hollow while pending, badges for protected / granted / declined / sign-off, muted pink offline or paused) and shows a count of items waiting on you.

Click the dot for the dropdown. On top: the connection status and how many items wait on you, the four access counters, the last thing Regula said (click it to open the page it points to), and one entry per pending request or draft (each opens its cockpit deep link). Then the cockpit links ("Open cockpit", "Open requests in the cockpit"), one pause entry that reads "Pause reactions for 1 h" or "Resume reactions" depending on the state, and the settings: "Show regula.dot on the desktop" (check item, off by default, remembered), "Let clicks pass through regula.dot" (check item, only enabled while the companion shows, resets on restart) and "Manage settings in the cockpit…", which opens the cockpit settings page. Everything beyond the desktop toggle is managed online in the cockpit, not in the app. Last: "Quit regula.dot". All labels follow the `--lang` setting.

When the companion is hidden and something happens (a rule fired, a request was sent, granted or declined, a draft needs sign-off), a small popup appears under the dot with the same wording as the bubble and an Open button; it goes away after 6 s or on click. When the companion is visible the bubble says it instead, so nothing shows twice.

On the desktop: drag Regula to move it. Hover it for a small x that hides it again; the dot and its dropdown keep everything reachable, and "Show regula.dot on the desktop" there brings it back.

## Layout

```
src/state.ts        state machine: model, reducer, pose derivation, timers
src/feed.ts         MockFeed (scripted) and SseFeed (GET /api/pet/state + /api/pet/events)
src/mock-script.ts  Mira's story: working → CH-ID-01 → IBAN request → granted → sign-off → declined set
src/rig.ts          the SVG rig (pink disc with a navy face); poses switched via data-state
src/styles.css      pose animations, bubble, close button
src/tokens.css      cockpit design tokens (re-skin here)
src/strings.ts      every word Regula says, EN and DE
src/bubble.ts       speech bubble
src/tray.ts         the dropdown derived from the model (status, counters, last note, items, links, action labels)
src/tauri.ts        bridge to the Rust shell with a browser fallback
src/popup.ts        the popup window under the menu-bar dot (popup.html; preview at /popup.html)
src-tauri/          Tauri 2 shell: menu-bar dot drawn per state, dropdown rebuilt from the summary, popup placement, hidden-by-default companion window, settings.json
```

## What the POC covers

P0 from the PRD: F1 (menu-bar dot first; the companion window is transparent, frameless, always on top, draggable, position remembered, click-through via tray, opt-in), F2 for the mock feed plus an SSE client with back-off for the real one, F3 all nine poses, F5 the tray with its summary dropdown, F6 bubbles. From P1: German strings, the approver queue in the model and tray dropdown, and F8 as an in-app popup under the dot instead of a native OS notification.

Not in the POC: device-token auth and keychain, native OS notifications (the popup stands in), nudges, settings beyond the desktop toggle (the dropdown links to the cockpit for those), signed installers, sound.
