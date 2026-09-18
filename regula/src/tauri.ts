/**
 * Thin bridge to the Tauri shell with a browser fallback, so `npm run dev`
 * in a plain browser still shows Regula (drag, tray and click-through are no-ops).
 */

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

export async function onTrayClickThrough(cb: () => void): Promise<void> {
  if (!isTauri) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("regula:toggle-click-through", () => cb());
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
