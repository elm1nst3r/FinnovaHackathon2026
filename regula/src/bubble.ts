import type { Bubble } from "./state";
import { t } from "./strings";

/** Speech bubble on state change. One click dismisses; a deep link, if any, opens the cockpit. */
export function renderBubble(el: HTMLElement, bubble: Bubble | null, handlers: { dismiss(): void; open(url: string): void }) {
  if (!bubble) {
    el.hidden = true;
    el.dataset.key = "";
    return;
  }
  if (el.dataset.key === bubble.key + bubble.until) return; // unchanged
  el.dataset.key = bubble.key + bubble.until;
  el.hidden = false;
  el.replaceChildren();

  const text = document.createElement("span");
  text.className = "bubble-text";
  text.textContent = t(bubble.key, bubble.params);
  el.appendChild(text);

  if (bubble.deepLink) {
    const a = document.createElement("button");
    a.className = "bubble-open";
    a.type = "button";
    a.textContent = t("openBtn");
    a.addEventListener("click", (ev) => {
      ev.stopPropagation();
      handlers.open(bubble.deepLink!);
      handlers.dismiss();
    });
    el.appendChild(a);
  }
  el.onclick = () => handlers.dismiss();
}
