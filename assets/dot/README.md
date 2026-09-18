# Dot — Character Assets

> **Always nearby for a brighter day.**
> Curious · Supportive · Expressive · Always around.

Dot is the friendly companion mascot for the Finnova AI Guard concept. This folder
contains the full set of ready-to-use **SVG** assets that match the official style
sheet. Every file is a self-contained, valid SVG (200×200 viewBox unless noted),
so it scales cleanly from a 16 px tray icon up to a hero illustration.

Open [`preview.html`](./preview.html) in a browser to see the whole set at once.

## Brand

| Token | Value | Usage |
|---|---|---|
| Base | `#F042BE` · rgb(240, 66, 190) | Body, accents, motion lines |
| Ink | `#0F1A3C` | Pupils, mouths, text, shadows |
| Eye white | `#FFFFFF` | Eyes |
| Warning | `#F5A623` | Safety / warning triangle, notification badge |
| Shield | `#9AA3B2` | Shield emblem |
| Bubble | `#E9ECF2` | Speech bubbles / UI |

Machine-readable tokens: [`brand/dot-tokens.json`](./brand/dot-tokens.json).
Recommended on-screen sizes: **16 / 24 / 32 / 48 / 64 px**. Simple. Friendly. Works everywhere.

## Contents

```
assets/dot/
├── brand/        dot-tokens.json          — colors, geometry, sizes
├── base/         dot-base.svg             — hero Dot
│                 dot-size-examples.svg    — 16→64 px strip
├── expressions/  11 faces
├── gestures/     5 actions
├── states/       5 states
├── context/      4 desktop scenes
├── lottie/       11 animated Lottie JSON  — see lottie/README.md
└── preview.html  contact-sheet viewer
```

### Expressions
`neutral` · `happy` · `excited` · `curious` · `thinking` · `angry` · `surprised` · `wink` · `thumbs-up` · `shield` · `safety-warning`

### Gestures & Actions
`follow-mouse` (follows you around) · `bounce` (playful movement) · `wave` (says hi) · `point-nudge` (gets your attention) · `peek` (hides and comes back)

### States
`thinking-glow` (subtle animated glow) · `notification` (new message / alert) · `working` (focused) · `success` (task complete) · `sleeping` (idle)

### In Context (on your desktop)
`keeps-you-company` (sits on windows) · `stays-close` (follows your mouse) · `always-nearby` (peeks when idle) · `positive-encouragement` (small moments, big impact)

## Usage

Inline, as an `<img>`, or as a CSS background:

```html
<img src="assets/dot/expressions/dot-happy.svg" width="48" height="48" alt="Dot" />
```

To recolor programmatically, replace `#F042BE` (body) and `#0F1A3C` (ink). All
strokes use `stroke-linecap="round"` and paths are already optimized for small sizes.

## Suggested mapping to AI Guard decisions

The character is decision-agnostic, but these pairings work well for the Guard UX:

| Guard decision | Suggested Dot |
|---|---|
| ALLOW | `thumbs-up` / `success` / `wink` |
| MAKE SAFE | `shield` / `working` |
| BLOCK | `safety-warning` / `surprised` |
| Idle / ambient | `neutral` / `peek` / `sleeping` |

---

<sub>Finnova Hackathon · Swiss {ai} Weeks 2026 · Lenzburg — Same dot. More possibilities.</sub>
