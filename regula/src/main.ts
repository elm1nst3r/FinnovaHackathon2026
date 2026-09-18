/**
 * Regula boot: one state machine, one feed, two views (rig, bubble).
 * The state machine is the only thing that talks to the cockpit; the views
 * only render the model and route clicks to deep links.
 */
import { createRig, DISC_CENTER_Y } from "./rig";
import { MockFeed, SseFeed, type Feed } from "./feed";
import { badgeRuleId, derivePose, initialModel, reduce, trayCount, type Model } from "./state";
import { renderBubble } from "./bubble";
import { setLang, t } from "./strings";
import { traySummary } from "./tray";
import {
  getConfig,
  isTauri,
  onTrayClickThrough,
  onTrayPause,
  openLink,
  setClickThrough,
  setDesktop,
  setTrayInfo,
  setTrayState,
  showTrayPopup,
  startDragging,
} from "./tauri";
import type { Input, Pose } from "./types";

const PAUSE_SECONDS = 60 * 60;
const LOOK_RADIUS_PX = 200;
const LOOK_MAX_PX = 1.8;

async function boot() {
  const config = await getConfig();
  setLang(config.lang);

  const stage = document.getElementById("stage")!;
  const petEl = document.getElementById("pet")!;
  const bubbleEl = document.getElementById("bubble")!;
  const closeEl = document.getElementById("close") as HTMLButtonElement;

  const rig = createRig();
  petEl.appendChild(rig.el);

  let model: Model = initialModel();
  let pose: Pose = "offline";
  let clickThrough = false;
  let dirty = true;

  const dispatch = (input: Input) => {
    const next = reduce(model, input, Date.now());
    if (next !== model) {
      model = next;
      dirty = true;
    }
  };

  const feed: Feed = config.mock ? new MockFeed(dispatch, config.cockpit_url) : new SseFeed(dispatch, config.cockpit_url);

  // ---------------------------------------------------------------- render
  const open = (url: string) => void openLink(url);
  const togglePause = () => dispatch({ type: "pause", seconds: model.pausedUntil > Date.now() ? 0 : PAUSE_SECONDS });
  // The x on the disc: Regula stays as the dot in the menu bar, where "Show regula.dot
  // on the desktop" brings it back. The browser preview has no menu bar, so there it just hides the pet.
  const close = () => {
    dispatch({ type: "dismiss-bubble" });
    if (isTauri) void setDesktop(false);
    else petEl.hidden = true;
  };
  const applyClickThrough = (enabled: boolean) => {
    clickThrough = enabled;
    stage.classList.toggle("click-through", clickThrough);
    void setClickThrough(clickThrough);
    dirty = true;
  };

  // The menu-bar dot: redrawn only when pose, count or (while Working) the breath phase changes.
  let trayKey = "";
  const syncTray = (now: number) => {
    const trayPose = model.disabled ? "disabled" : pose;
    const phase = trayPose === "working" ? Math.floor(now / 600) % 2 : 0;
    const count = trayCount(model);
    const key = `${trayPose}:${count}:${phase}`;
    if (key === trayKey) return;
    trayKey = key;
    void setTrayState(trayPose, count, phase);
  };

  // The dropdown behind the dot: status, counters, last note, items waiting, links and action labels.
  let trayInfoKey = "";
  const syncTrayInfo = () => {
    const info = traySummary(model, pose, config.cockpit_url, config.mock);
    const key = JSON.stringify(info);
    if (key === trayInfoKey) return;
    trayInfoKey = key;
    void setTrayInfo(info);
  };

  // Every new bubble (except the quiet "thinking" one) is also offered to the shell
  // as a popup under the dot; the shell only shows it while the companion is hidden.
  let popupKey = "";
  const syncPopup = () => {
    const b = model.bubble;
    if (!b || b.key === "working") return;
    const key = b.key + b.until;
    if (key === popupKey) return;
    popupKey = key;
    void showTrayPopup(t(b.key, b.params), b.deepLink ?? null);
  };

  const render = () => {
    const now = Date.now();
    const nextPose = derivePose(model, now);
    if (nextPose !== pose) {
      pose = nextPose;
      rig.setPose(pose);
    }
    syncTray(now);
    syncTrayInfo();
    syncPopup();
    rig.setRuleId(badgeRuleId(model, pose));
    renderBubble(bubbleEl, model.bubble, { dismiss: () => dispatch({ type: "dismiss-bubble" }), open });
    if (model.disabled) {
      feed.stop();
      petEl.style.opacity = "0.3";
    }
    dirty = false;
  };

  // 250 ms tick: timers in the model (bubble auto-hide, celebratory poses, pause) expire here.
  setInterval(() => {
    const now = Date.now();
    dispatch({ type: "tick", now });
    if (dirty) render();
    else syncTray(now);
  }, 250);

  // ---------------------------------------------------------------- close button
  closeEl.hidden = false;
  closeEl.title = t("close");
  closeEl.setAttribute("aria-label", t("close"));
  closeEl.addEventListener("mousedown", (e) => e.stopPropagation()); // not a drag start
  closeEl.addEventListener("click", close);

  // ---------------------------------------------------------------- drag vs click
  // Mouse down on Regula: a few px of movement starts a native window drag.
  let down: { x: number; y: number } | null = null;
  let dragging = false;
  petEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
    dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
      dragging = true;
      down = null;
      void startDragging();
    }
  });
  window.addEventListener("mouseup", () => {
    down = null;
    dragging = false;
  });

  // ---------------------------------------------------------------- eye contact
  window.addEventListener("mousemove", (e) => {
    const r = petEl.getBoundingClientRect();
    const cx = r.left + r.width * 0.5;
    const cy = r.top + r.height * DISC_CENTER_Y;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > LOOK_RADIUS_PX || d < 1) {
      rig.look(0, 0);
      return;
    }
    const k = (Math.min(d, LOOK_RADIUS_PX) / LOOK_RADIUS_PX) * LOOK_MAX_PX;
    rig.look((dx / d) * k, (dy / d) * k);
  });
  document.addEventListener("mouseleave", () => rig.look(0, 0));

  // ---------------------------------------------------------------- keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dispatch({ type: "dismiss-bubble" });
      return;
    }
    if (!config.mock) return;
    // Demo controls, mock feed only.
    if (e.key === " ") {
      e.preventDefault();
      feed.next?.();
    } else if (e.key === "r" || e.key === "R") feed.restart?.();
    else if (e.key === "o" || e.key === "O") feed.toggleOffline?.();
    else if (e.key === "p" || e.key === "P") togglePause();
  });

  // ---------------------------------------------------------------- tray
  await onTrayPause((seconds) => dispatch({ type: "pause", seconds }));
  await onTrayClickThrough(applyClickThrough);

  feed.start();
  render();
}

void boot();
