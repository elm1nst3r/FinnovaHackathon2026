# Regula, the Finnova desktop pet (POC)

Regula is the pink full stop from the finnova logo with a face. It sits on a finnova employee's desktop and mirrors the state of the Finnova AI Cockpit. This is the hackathon proof of concept described in [docs/prd/finnova-pet-prd.md](../docs/prd/finnova-pet-prd.md).

## Run

```sh
npm install
npm start            # Tauri window with the scripted mock feed (same as --mock)
npm run dev          # browser preview at http://localhost:1420 (no tray, no drag)
npm test             # replays Mira's story through the state machine
npm run poses        # regenerates docs/poses.svg, the static pose sheet
```

Flags for the built binary: `--mock`, `--cockpit http://host`, `--lang de`. Environment: `REGULA_COCKPIT_URL`, `REGULA_LANG`. With no cockpit URL the mock feed is used.

Rust: `src-tauri/rust-toolchain.toml` pins a current stable toolchain (Tauri 2.11's dependencies need Rust ≥ 1.85).

## Demo controls (mock feed only)

| Key | Action |
| --- | --- |
| Space | next step of the story |
| R | restart the story |
| O | toggle offline |
| P | pause / resume reactions |
| Esc | dismiss bubble |

The menu-bar dot has four looks and never animates: solid pink when nothing waits, a hollow ring with the number next to it while items wait, muted pink while offline or paused, grey when the cockpit disabled the pet. Transient events (protected, granted, declined) are said by the popup or the bubble, not by the dot. The dot's tooltip is the same status line the dropdown shows, in the chosen language.

Click the dot for the dropdown. On top: the status line (connection, how many items wait, remaining pause time, whether clicks pass through), the cockpit totals ("In the cockpit: 3 open · 4 protected · 1 granted"), the last thing Regula said with its time (click it to open the page it points to), and the items waiting in two groups: "Needs you" (requests sent to you as an approver, drafts needing sign-off, declined requests until you open the approver's note) and "With the approver" (your own requests, with how long they have been waiting). Then "Open cockpit", "Pause reactions" for one hour (or "Resume reactions" while paused), and the settings: "Show on desktop" (check item, off by default, remembered), "Let clicks pass through" (check item, only enabled while the companion shows, resets on restart), "Show notes while hidden" (check item, on by default, remembered; off, the dropdown still keeps the last note), "Settings…" and "About regula.dot", both cockpit pages. Everything beyond the desktop toggle is managed online in the cockpit, not in the app. Last: "Quit regula.dot". All labels, dates and times follow the `--lang` setting.

When the companion is hidden and something happens (a rule fired, a request was sent, granted or declined, a draft needs sign-off), a small popup appears under the dot with the same wording as the bubble and an Open button. A line that only informs goes away after 6 s; a line with an Open button stays 10 s, and neither goes while the cursor rests on it. Click anywhere on it to dismiss. When the companion is visible the bubble says it instead, with the same timing, so nothing shows twice. On the first run the popup says once where regula.dot lives.

On the desktop: drag Regula to move it. It never leaves the screen: dragged past the left edge, the disc changes side so the bubble opens to the right, and whatever still hangs over an edge is nudged back into the work area once the drag settles. Hover it for a small x that hides it again; the dot and its dropdown keep everything reachable, and "Show on desktop" there brings it back. While clicks pass through, the disc fades and wears a dashed ring, so it is clear why it ignores the cursor. If a link cannot be opened, Regula says so in a bubble.

## Layout

```
src/state.ts        state machine: model, reducer, pose derivation, timers
src/feed.ts         MockFeed (scripted) and SseFeed (GET /api/pet/state + /api/pet/events)
src/mock-script.ts  Mira's story: working → CH-ACC-01 masks the account number → request → granted → sign-off → declined set
src/rig.ts          the SVG rig (pink disc with a navy face); poses switched via data-state
src/styles.css      pose animations, bubble, close button
src/tokens.css      cockpit design tokens (re-skin here)
src/strings.ts      every word Regula says, EN and DE
src/bubble.ts       speech bubble
src/tray.ts         the dropdown derived from the model (status, totals, last note, grouped items with ages, links, action labels)
src/tauri.ts        bridge to the Rust shell with a browser fallback
src/popup.ts        the popup window under the menu-bar dot (popup.html; preview at /popup.html)
src-tauri/          Tauri 2 shell: static menu-bar dot (four looks), dropdown rebuilt from the summary, popup placement, hidden-by-default companion window (360 x 190, sized to the disc plus its bubble), settings.json
```

## What the POC covers

P0 from the PRD: F1 (menu-bar dot first; the companion window is transparent, frameless, always on top, draggable, position remembered, click-through via tray, opt-in), F2 for the mock feed plus an SSE client with back-off for the real one, F3 all nine poses, F5 the tray with its summary dropdown, F6 bubbles. From P1: German strings, the approver queue in the model and tray dropdown, and F8 as an in-app popup under the dot instead of a native OS notification.

Not in the POC: device-token auth and keychain, native OS notifications (the popup stands in), nudges, settings beyond the desktop toggle (the dropdown links to the cockpit for those), signed installers, sound.
