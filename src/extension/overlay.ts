/**
 * The in-page surfaces of the enforcement point (the guard bar, its
 * intervention sheet, the "Ask regula.dot" sheet) render into a closed shadow
 * root. The page's own stylesheet cannot reach in to hide a block notice, and
 * nothing in the page can read a decision back out.
 */
export function mountRoot(hostId: string): ShadowRoot {
  // A closed root is not reachable through `element.shadowRoot`, so a second
  // mount replaces the host rather than looking for the old root.
  document.getElementById(hostId)?.remove();

  const host = document.createElement('div');
  host.id = hostId;
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);
  return shadow;
}

export const STYLES = `
:host { all: initial; }
.bar, .sheet {
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #16181d;
}
.bar {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1px solid #e2e5ea; border-radius: 999px;
  padding: 7px 14px; box-shadow: 0 6px 22px rgba(0,0,0,.14); z-index: 2147483646;
}
.bar .dot { width: 9px; height: 9px; border-radius: 50%; background: #1f4ed8; }
.bar .dot.off { background: #9aa1ad; }
.bar select { font: inherit; border: 1px solid #e2e5ea; border-radius: 6px; padding: 2px 6px; }
.bar .stale { color: #9a6100; max-width: 260px; }
.backdrop {
  position: fixed; inset: 0; background: rgba(16,18,22,.55);
  display: flex; align-items: center; justify-content: center; z-index: 2147483647;
}
.sheet {
  background: #fff; border-radius: 12px; padding: 22px; width: min(560px, 92vw);
  max-height: 84vh; overflow: auto; box-shadow: 0 18px 48px rgba(0,0,0,.3);
}
.sheet h2 { margin: 0 0 4px; font-size: 17px; }
.sheet h3 { margin: 18px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #646b78; }
.sheet p { margin: 6px 0; }
.sheet ul { margin: 6px 0; padding-left: 18px; }
.muted { color: #646b78; font-size: 12px; }
.verdict { display: inline-block; font-weight: 650; padding: 2px 9px; border-radius: 999px; font-size: 12px; }
.verdict.block { background: #fdeceb; color: #b4231d; }
.verdict.safe { background: #fdf3e3; color: #9a6100; }
.verdict.allow { background: #e6f4ea; color: #1e6b3a; }
.tool { padding: 8px 0; border-top: 1px solid #eef0f3; }
.tool .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.tool .name { font-weight: 600; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
button {
  font: inherit; padding: 7px 14px; border-radius: 7px; cursor: pointer;
  border: 1px solid #1f4ed8; background: #1f4ed8; color: #fff;
}
button.ghost { background: #fff; color: #16181d; border-color: #e2e5ea; }
textarea { width: 100%; font: inherit; padding: 7px; border: 1px solid #e2e5ea; border-radius: 7px; }
.error { color: #b4231d; font-size: 12px; }
`;
