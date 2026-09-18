# Regula dot: design handover

As of 2026-09-18 · for the finnova design team · owner of the code: HackLenzburg 2026 Regula team

Regula is the pink full stop of the finnova logo, living in the macOS menu bar and, if the advisor opts in, as a small companion on the desktop. The POC ships with a placeholder dot drawn in code. This document says what we need from design to replace it, in which format, and which rules the assets must follow so they drop into the app without rework. PRD: `docs/finnova-pet-prd.md`.

## What the dot has to say

The dot mirrors nine cockpit states. Each state needs to be readable at 8 pt in the menu bar and at 52 px on the desktop, and the advisor must be able to tell them apart at a glance without a legend.

| State | Meaning | Placeholder today (menu bar) | Placeholder today (desktop) |
| --- | --- | --- | --- |
| idle | nothing happening | solid pink dot | disc, blinks, breathes |
| working | assistant is generating | dot breathes (two frames) | eyes narrow, dotted ring orbits |
| protected | a rule masked something | navy badge top-right | shield in front, rule id pill below |
| pending | request waits with the approver | hollow pink ring | dashed outline, shield parked at side |
| granted | access approved | green badge top-right | one hop, shield turns green, confetti |
| declined | access declined | grey badge top-right | disc sinks, flat mouth, small nod |
| signoff | a draft needs a reviewer | navy badge with a hole | pencil leans on the disc, sheet at foot |
| offline | cockpit not reachable | muted pink dot | muted pink, eyes closed, zzz, grey badge |
| paused | user paused reactions | hollow muted pink ring | muted pink, eyes closed, moon badge |

Next to the menu-bar dot the app prints a number when items wait on the user (pending requests, drafts, approver queue). Design does not need to deliver digits; macOS renders them in the system font.

## Deliverable 1: menu-bar dot (required)

- One image per state, nine in total, plus a second "working" frame if you want the breath to stay.
- Format: **SVG** preferred (we rasterise at build time), or **PNG at 2x** (36 × 36 px canvas, shown at 18 × 18 pt). If PNG, also give 1x (18 × 18 px) for non-Retina.
- Canvas 18 × 18 pt, transparent. The dot itself about **8 pt across**, centred, so it reads as a full stop next to 13 pt menu-bar text. Badges and rings may use the rest of the canvas.
- Full colour, not a macOS template image: the dot must keep the finnova pink on both the light and the dark menu bar. Anything navy or grey needs a 1 pt transparent gap against the pink so it survives a dark menu bar.
- No gradients, no shadows, no text.
- File names: `tray-<state>.svg` (or `.png` and `@2x.png`), states spelled as in the table.

## Deliverable 2: desktop companion (optional for the POC, wanted for the pilot)

- The companion is a **120 × 120 px canvas** with the disc at centre (60, 70), radius 26 (52 px). The face appears only here, never in the menu bar.
- Either a **single SVG** with all props present and layers named as below, or a **Rive** file with one state machine and a string input `state` taking the nine values. Lottie is the fallback.
- SVG layer / class names the code drives: `disc`, `pupils` (both eyes; inside it `eye-white`, `pupil` and `spark` per eye, and only the pupil and its spark move for eye contact), `lids`, `brows`, `mouth-smile`, `mouth-flat`, `shield` with `shield-shape` and `shield-check`, `ring`, `dashed`, `accents` (Dot's motion lines), `shadow`, `badge` with `badge-text` (mono rule id such as CH-ACC-01), `pencil`, `sheet`, `confetti`, `zzz`, `badge-offline`, `badge-moon`. Keep the names and the CSS keeps working.
- The placeholder now wears the face from the **Dot character set** (`assets/dot/`, see its README): Dot's eye geometry, its asymmetric eye line, its smile, ground shadow and accent lines, scaled by 26/70 onto Regula's r=26 disc. The palette is unchanged finnova tokens, so Dot's ink `#0F1A3C` renders as `--finnova-navy` and its eye white as `--paper`. Dot's own poses (`angry`, `wave`, `excited`, …) are not used; the nine cockpit states remain the vocabulary.
- Motion rules from the PRD: transitions 300 ms ease-out, no bounce over 4 px, no rotation over 8 degrees, squash and stretch within 6 % of the diameter, the disc is a circle at rest, one accessory at a time. Reduced motion keeps the pose and drops the loop.
- The reference of the current placeholder is `regula/docs/poses.png`, one still per state.

## Colours and type

Only these tokens, taken from the logo SVG and the cockpit design tokens (`regula/src/tokens.css`):

| Token | Value | Use |
| --- | --- | --- |
| Finnova pink | #F042BE | the dot, the disc |
| Finnova navy | #17233B | eyes, mouth, rule id pill, "rule fired" badge |
| Muted pink | #F9B6E4 | offline and paused |
| Finnova green | #1F4D3A | granted badge |
| Muted | #4D5651 | declined and offline badges |
| Protect tint | #FBEBC8 | shield while protected and pending |
| Granted tint | #DDEFE4 | shield after approval |
| Paper | #F6F4EE | eye whites, sheet |
| White | #FFFFFF | the highlight inside each pupil (Dot's spark) |

Type: IBM Plex Mono for the rule id, nothing else is text.

## Constraints that are not negotiable

- The dot never shows a value, a client name or conversation text. It may show a rule id and a count.
- No emoji, no faces in the menu bar; the face belongs to the desktop companion only.
- The logo's full stop is the reference for size and colour: in the wordmark the dot is about a quarter of the x-height, sitting on the baseline.
- Assets must be usable under the finnova brand licence; the logo on Wikimedia Commons is CC BY-SA 4.0 and only served as the colour reference.

## How to hand over

Drop files into `regula/src-tauri/icons/tray/` (menu bar) and `regula/src/rig/` (desktop); or send a Figma link with the nine states as components named after the states. We swap the placeholder in one file per surface.

Open questions for design:

- [ ] Should the "working" dot animate in the menu bar at all, or stay still and only change on the desktop?
- [ ] Is a hollow ring the right sign for "waiting", or do you prefer a half-filled dot?
- [ ] Do you want distinct offline and paused looks, or one "asleep" look with different badges?
