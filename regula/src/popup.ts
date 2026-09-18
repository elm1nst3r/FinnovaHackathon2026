/**
 * The popup window under the menu-bar dot. Shown by the shell when something
 * happened while the companion is hidden; carries the bubble's wording and,
 * if the event had one, an Open button for its cockpit deep link. Hides itself
 * after a few seconds or on click. In the browser preview (/popup.html) it
 * shows a sample line so the styling can be checked.
 */

type Payload = { text: string; deepLink: string | null; openLabel: string };

const AUTO_HIDE_MS = 6_000;
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const el = document.getElementById("popup")!;
let timer: ReturnType<typeof setTimeout> | null = null;

async function hide() {
  if (timer) clearTimeout(timer);
  timer = null;
  el.hidden = true;
  if (isTauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
  }
}

async function open(url: string) {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_cockpit", { url });
  } else {
    window.open(url, "_blank", "noopener");
  }
  await hide();
}

async function show(p: Payload) {
  el.replaceChildren();
  const dot = document.createElement("i");
  dot.className = "popup-dot";
  el.appendChild(dot);
  const text = document.createElement("span");
  text.className = "popup-text";
  text.textContent = p.text;
  text.title = p.text;
  el.appendChild(text);
  if (p.deepLink) {
    const b = document.createElement("button");
    b.className = "popup-open";
    b.type = "button";
    b.textContent = p.openLabel;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void open(p.deepLink!);
    });
    el.appendChild(b);
  }
  el.onclick = () => void hide();
  el.hidden = false;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void hide(), AUTO_HIDE_MS);

  if (isTauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().show();
  }
}

async function boot() {
  if (!isTauri) {
    void show({ text: "CH-ID-01 kept the identifier masked.", deepLink: "https://cockpit.finnova.local/assistant", openLabel: "Open" });
    return;
  }
  const { listen } = await import("@tauri-apps/api/event");
  await listen<Payload>("regula:popup", (e) => void show(e.payload));
}

void boot();
