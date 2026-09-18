# Finnova Corporate Design — reference for this project

Source: Finnova Corporate Design Manual (insideplus, *Home › Corporate Design*).
This file records only what the AI Guard cockpit and extension need in order to
look like Finnova: the colour palette, the type system and the logo rules. It is
a working reference, not a replacement for the official manual, which remains the
source of truth.

> The manual states that consistent application of the CD is **mandatory** for
> all internal and external appearances. Publications and anything customer-facing
> should be cleared with the communications team (`communication@finnova.com`).

## Logo

- The Finnova logo is the **wordmark "finnova" with the dot**, used only in its
  complete, unaltered form. Do not rebuild it in another font.
- The **icon** (the "f" in a circle with the dot) is reserved for favicons and
  software/desktop icons — nothing else.
- Official assets (download from the manual, not reproduced here):
  - `Finnova_Logo_RGB` — for light backgrounds
  - `Finnova_Logo_RGB_neg` — for dark backgrounds (white wordmark, pink dot)
  - `Finnova_Favicon_RGB_blau` — icon for light backgrounds (navy circle)
  - `Finnova_Favicon_RGB_pink` — icon for dark backgrounds (pink circle)

**In this prototype we deliberately do not reproduce the logo.** The cockpit
uses the Finnova colour and type system plus a pink "dot" as a brand cue. When
the official SVG is available, drop it into `src/cockpit/` and place it in the
header per the manual's clear-space rules; drop the favicon into the same folder
and reference it from `index.html`.

## Colours

The core palette, taken from the manual's *Farben* section.

| Token | Hex | Role in the manual | Use in the cockpit |
|---|---|---|---|
| Navy 900 | `#17233B` | Darkest brand navy | Top bar, primary text (ink) |
| Navy 700 | `#233353` | Brand navy | Solid buttons, links, active states |
| Steel | `#7a8faf` | Blue-grey | Muted text / borders (darkened for contrast) |
| Mauve | `#ad5c96` | Accent | Charts, secondary accents |
| Pink | `#f042be` | Signature accent (the "dot") | Brand dot, focus ring, highlights |
| Orange | `#ff981f` | Accent | Warning / "made safe" status |
| Yellow | `#fff600` | Accent | Charts, sparse highlights |
| Green | `#30d689` | Accent | Success / "allowed" status |
| Cyan | `#00bad0` | Accent | Info, charts |
| White | `#ffffff` | — | Surfaces |

Gradients (*Farbverläufe*) run cyan→green, green→yellow, yellow→orange,
orange→pink and pink→blue. They are decorative; the cockpit does not use them for
anything that carries meaning.

### Contrast note

The accent colours are bright and fail text-contrast checks on white. For text
and status badges the cockpit uses **darkened derivations** of the Finnova hues
(e.g. a darker green for "allowed" text) while keeping the bright hue for fills
and accents. The palette contains **no red**; "blocked" therefore uses a
functional red outside the core palette, because a block has to be unambiguous.

## Typography

From the manual's *Schriften* section:

- **Univers** — the base typeface (body text). Weights shown: Univers 45 Light
  (Fliesstext), Univers 55 Roman (subtitles / emphasis), Univers 57 Light (heads).
- **The Serif** — the display / accent typeface (headlines, leads).
- **Arial** — used for PowerPoint and designated as the **fallback for web
  applications**.

Univers and The Serif are licensed fonts and are not bundled here. The cockpit
therefore follows the manual's own guidance and falls back to Arial, while
referencing the licensed families first so they are used automatically if ever
installed:

```css
--font-body:    'Univers', Arial, Helvetica, sans-serif;
--font-display: 'TheSerif', 'Univers', Arial, Helvetica, sans-serif;
```

If the licensed web-font files become available, add `@font-face` rules in
`src/cockpit/styles.css` and nothing else needs to change.

## Where this is applied

- `src/cockpit/styles.css` — the `:root` block defines the Finnova tokens above
  and maps them to the cockpit's semantic variables. This is the single place to
  adjust the palette.
- The browser extension's intervention UI (`src/extension/guard.ts`) is styled
  in a closed shadow root and is intentionally minimal; it can adopt the same
  tokens later if the demo calls for it.
