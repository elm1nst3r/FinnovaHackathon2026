/**
 * Thin bridge to the Tauri shell with a browser fallback, so `npm run dev`
 * in a plain browser still shows Regula (drag, tray and click-through are no-ops).
 */

import type { TrayInfo } from "./tray";
import { t } from "./strings";

export type AppConfig = { mock: boolean; cockpit_url: string; lang: string; desktop: boolean };

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function getConfig(): Promise<AppConfig> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<AppConfig>("get_config");
  }
  const q = new URLSearchParams(location.search);
  const cockpit = q.get("cockpit") ?? "";
  return {
    mock: !cockpit || q.has("mock"),
    cockpit_url: (cockpit || "https://cockpit.finnova.local").replace(/\/$/, ""),
    lang: q.get("lang") ?? "en",
    desktop: true, // the browser preview has no menu bar, so the companion is always shown
  };
}

export async function openLink(url: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_cockpit", { url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

export async function startDragging(): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function setClickThrough(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_click_through", { enabled });
}

export async function onTrayPause(cb: (seconds: number) => void): Promise<void> {
  if (!isTauri) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<number>("regula:pause", (e) => cb(e.payload));
}

/** The shell owns the click-through check item and applies it to the window; this only mirrors it. */
export async function onTrayClickThrough(cb: (enabled: boolean) => void): Promise<void> {
  if (!isTauri) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<boolean>("regula:click-through", (e) => cb(e.payload));
}

/** The menu-bar dot mirrors the pose; `count` is shown next to it, `phase` makes Working breathe. */
export async function setTrayState(pose: string, count: number, phase: number): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_state", { pose, count, phase });
}

/** Opt in or out of the desktop companion; the shell persists it and shows / hides the window. */
export async function setDesktop(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_desktop", { enabled });
}

/** What the menu-bar dropdown shows; the shell rebuilds its native menu from this. */
export async function setTrayInfo(info: TrayInfo): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_info", { info });
}

/**
 * Something happened while the companion is hidden: the shell shows a small
 * popup under the menu-bar dot with the same wording as the bubble. When the
 * companion is visible the bubble already says it and the shell does nothing.
 */
export async function showTrayPopup(text: string, deepLink: string | null): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_popup", { text, deepLink, openLabel: t("openBtn") });
}
