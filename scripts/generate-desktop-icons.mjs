// One-time asset generation: rasterizes scripts/assets/icon-desktop.svg into
// the PNG sizes Windows/Chromium actually use for the taskbar and shortcuts.
// Not run at build time — its output is committed to public/.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(root, "assets/icon-desktop.svg"));

for (const size of [192, 512]) {
  const out = path.join(root, "..", "public", `icon-${size}.png`);
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
