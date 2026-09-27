// One-time asset generation: rasterizes the icon SVGs into the PNG sizes the
// platforms actually use. Not run at build time — its output is committed to
// public/.
//   - scripts/assets/icon-desktop.svg -> icon-{192,512}.png (Windows/Chromium
//     taskbar and shortcuts; 'any' purpose, drawn with its own rounding)
//   - public/icon-maskable.svg -> icon-maskable-{192,512}.png (Android home
//     screen; PNG alongside the SVG because not every Android installer
//     rasterizes SVG manifest icons)
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "..", "public");

const sources = [
  { svg: path.join(root, "assets/icon-desktop.svg"), name: "icon" },
  { svg: path.join(publicDir, "icon-maskable.svg"), name: "icon-maskable" },
];

for (const { svg, name } of sources) {
  const data = readFileSync(svg);
  for (const size of [192, 512]) {
    const out = path.join(publicDir, `${name}-${size}.png`);
    await sharp(data, { density: 384 }).resize(size, size).png().toFile(out);
    console.log("wrote", out);
  }
}
