/**
 * Regula's rig: the pink full stop from the finnova logo with a navy face.
 * One inline SVG, all props present, poses switched by CSS via `data-state`
 * on the root. Colors come from tokens.css so a re-skin is a one-file job.
 *
 * In the menu bar Regula is a plain pink dot (drawn by the Rust shell); this
 * rig is the desktop companion the user can opt into, and the face appears
 * only here. The PRD calls for a Rive/Lottie rig; this SVG+CSS rig is the
 * POC stand-in and follows the same state and motion rules.
 */
import type { Pose } from "./types";

export type Rig = {
  el: SVGSVGElement;
  setPose(pose: Pose): void;
  setRuleId(ruleId: string | null): void;
  /** Eye contact: offset in px, already clamped by the caller. */
  look(dx: number, dy: number): void;
  blink(): void;
  destroy(): void;
};

const NS = "http://www.w3.org/2000/svg";

/** Disc center on the 120 x 120 canvas, as a fraction of the height (for eye contact). */
export const DISC_CENTER_Y = 70 / 120;

export function createRig(): Rig {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = SVG.trim();
  const el = wrapper.firstElementChild as SVGSVGElement;
  el.dataset.state = "idle";

  const badgeText = el.querySelector<SVGTextElement>(".badge-text")!;
  const pupils = el.querySelector<SVGGElement>(".pupils")!;

  // Randomised blink: every 4 to 7 s (PRD Idle spec).
  let blinkTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleBlink = () => {
    blinkTimer = setTimeout(
      () => {
        blink();
        scheduleBlink();
      },
      4_000 + Math.random() * 3_000,
    );
  };
  const blink = () => {
    el.classList.add("blink");
    setTimeout(() => el.classList.remove("blink"), 140);
  };
  scheduleBlink();

  return {
    el,
    setPose(pose) {
      if (el.dataset.state !== pose) {
        el.dataset.state = pose;
        // Restart one-shot animations by forcing a reflow on the class toggle.
        el.classList.remove("oneshot");
        void el.getBoundingClientRect();
        el.classList.add("oneshot");
      }
    },
    setRuleId(ruleId) {
      badgeText.textContent = ruleId ?? "";
      el.classList.toggle("has-badge", Boolean(ruleId));
    },
    look(dx, dy) {
      pupils.style.setProperty("--lx", `${dx.toFixed(2)}px`);
      pupils.style.setProperty("--ly", `${dy.toFixed(2)}px`);
    },
    blink,
    destroy() {
      if (blinkTimer) clearTimeout(blinkTimer);
    },
  };
}

// Everything lives on a 120 x 120 canvas. The disc is small on purpose, the
// logo's full stop rather than a face-sized blob: center (60, 70), radius 26.
// The mono rule-id pill hangs under it, accessories lean on it.
const SVG = `
<svg class="pet" xmlns="${NS}" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Regula">
  <g class="dashed"><circle cx="60" cy="70" r="34" /></g>
  <g class="ring"><circle cx="60" cy="70" r="31" /></g>

  <g class="hop">
    <g class="body">
      <g class="breath">
        <circle class="disc" cx="60" cy="70" r="26" />

        <g class="face">
          <!-- eyebrows: only shown when Regula is apologetic -->
          <g class="brows">
            <path class="brow brow-l" d="M47.5 58.5 l7 -2" />
            <path class="brow brow-r" d="M72.5 58.5 l-7 -2" />
          </g>
          <!-- eyes: navy dots that follow the cursor -->
          <g class="pupils">
            <circle class="eye" cx="51.5" cy="65" r="2.9" />
            <circle class="eye" cx="68.5" cy="65" r="2.9" />
            <circle class="spark" cx="52.5" cy="64" r="0.8" />
            <circle class="spark" cx="69.5" cy="64" r="0.8" />
          </g>
          <!-- eyelids in disc pink: scaleY 0 = open -->
          <g class="lids">
            <rect class="lid" x="47" y="60" width="9" height="9" rx="4.5" />
            <rect class="lid" x="64" y="60" width="9" height="9" rx="4.5" />
          </g>
          <!-- closed-eye lines for offline / paused -->
          <g class="sleep-eyes"><path d="M48.5 65.5 q3 2 6 0" /><path d="M65.5 65.5 q3 2 6 0" /></g>
          <!-- mouth: a small smile, or a flat line when declined -->
          <path class="mouth mouth-smile" d="M55 76 q5 4 10 0" />
          <path class="mouth mouth-flat" d="M55.5 76.5 h9" />
        </g>

        <!-- shield: in front of the disc when Protected / Granted, parked at its side when Pending -->
        <g class="shield">
          <path class="shield-shape" d="M0 -12 l10 3.5 v8 c0 7.5 -4.5 12 -10 15 c-5.5 -3 -10 -7.5 -10 -15 v-8 z" />
        </g>

        <!-- pencil leaning against the disc for sign-off -->
        <g class="pencil"><path d="M80 58 L92 92" /><path class="tip" d="M92 92 l0.5 4 l-3.5 -2.5 z" /></g>
      </g>
    </g>
  </g>

  <!-- mono rule-id pill under the disc -->
  <g class="badge">
    <rect class="badge-pill" x="35" y="102" width="50" height="11" rx="5.5" />
    <text class="badge-text mono" x="60" y="109.8" text-anchor="middle"></text>
  </g>

  <!-- confetti on Granted -->
  <g class="confetti">
    <rect class="c1" x="38" y="30" width="4" height="4" />
    <rect class="c2" x="58" y="22" width="4" height="4" />
    <rect class="c3" x="78" y="30" width="4" height="4" />
  </g>

  <!-- sheet at the foot of the disc for sign-off -->
  <g class="sheet"><rect x="80" y="94" width="22" height="14" rx="2" /><path d="M84 99 h14 M84 103 h10" /></g>

  <!-- sleep / offline / paused -->
  <g class="zzz"><text x="82" y="52">z</text><text x="89" y="44">z</text><text x="96" y="36">z</text></g>
  <g class="badge-offline"><circle cx="79" cy="52" r="4" /></g>
  <g class="badge-moon"><path d="M78 45.5 a7 7 0 1 0 7 8.5 a5 5 0 1 1 -7 -8.5 z" /></g>
</svg>`;
