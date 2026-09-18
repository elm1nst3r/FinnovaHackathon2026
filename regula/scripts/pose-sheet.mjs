// Renders every Regula pose as a static SVG sheet (docs/poses.svg) using the real rig and CSS.
// On macOS, rasterize with:  qlmanage -t -s 2340 -o docs docs/poses.svg
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/rig.ts"), "utf8");
const svg = src
  .slice(src.indexOf("<svg"), src.lastIndexOf("</svg>") + 6)
  .replace("${NS}", "http://www.w3.org/2000/svg");
const tokens = fs.readFileSync(path.join(root, "src/tokens.css"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8").replace('@import "./tokens.css";', "");
const poses = ["idle", "working", "protected", "pending", "granted", "declined", "signoff", "offline", "paused"];
const badge = { protected: "CH-ID-01", pending: "CH-ACC-01" };

let sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 300" width="650" height="300"><style>${tokens}${styles} .pet *{transition:none!important;animation:none!important}</style><rect width="100%" height="100%" fill="#fff"/>`;
poses.forEach((p, i) => {
  const x = (i % 5) * 130 + 5;
  const y = Math.floor(i / 5) * 150 + 10;
  let s = svg
    .replace('data-state="idle"', "")
    .replace('class="pet"', `class="pet${badge[p] ? " has-badge" : ""}" data-state="${p}" x="${x}" y="${y}"`)
    .replace("></text>", `>${badge[p] ?? ""}</text>`);
  sheet += s + `<text x="${x + 60}" y="${y + 135}" text-anchor="middle" font-family="Helvetica" font-size="11" fill="#4D5651">${p}</text>`;
});
sheet += "</svg>";
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/poses.svg"), sheet);
console.log("wrote docs/poses.svg");
