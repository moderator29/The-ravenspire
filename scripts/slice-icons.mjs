/* Slice the generated 3D icon sheets into individual named PNGs.
 *
 * Usage:
 *   1. Drop the generated sheets into public/icons/3d/_sheets/ as
 *      sheet-1.png, sheet-2.png, sheet-3.png
 *   2. npm run icons
 *
 * Output lands in public/icons/3d/<slug>.png, each trimmed to its artwork,
 * centred on a square transparent canvas and written at 512x512.
 *
 * The generator leaves a red matte fringe around the cut outs, visible as a red
 * halo on the sheet edges. Any pixel that is strongly red dominant and only
 * partially opaque is matte residue rather than artwork (the palette is gold,
 * bone and obsidian, with ember reserved for fire, and ember is orange rather
 * than pure red), so those pixels are knocked out before trimming.
 */

import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHEET_DIR = path.join(ROOT, "public/icons/3d/_sheets");
const OUT_DIR = path.join(ROOT, "public/icons/3d");
const SIZE = 512;

/* Grid layout and slug order for each sheet, read left to right, top to
   bottom. Rename a slug here and re-run to relabel an icon. */
const SHEETS = [
  {
    file: "sheet-1.png",
    cols: 5,
    rows: 5,
    names: [
      "raven", "keep", "crown", "oath-scroll", "house-corvane",
      "duel", "council", "whispers", "call-orb", "chest",
      "accuracy", "chronicle", "banner", "forge", "trophy",
      "arena", "nightvale", "dragon-egg", "treasure-map", "season",
      "scales", "market", "voyage", "portal", "settings",
    ],
  },
  {
    file: "sheet-2.png",
    cols: 8,
    rows: 8,
    names: [
      "raven", "keep", "crown", "oath-scroll", "house-corvane", "duel", "council", "quest-scroll",
      "whispers", "call-orb", "accuracy", "trophy", "banner", "chest", "chronicle", "analytics",
      "house-hall", "market", "arena", "cards", "crossed-axes", "dragon-egg", "forge", "tower",
      "compass", "treasure-map", "leadership", "alliance", "envelope", "season", "podium", "rivalry",
      "coins", "satchel", "scrying", "identity", "nightvale", "hood", "ember-hand", "brazier",
      "chronicler", "search", "scales", "network", "gatehouse", "realm-map", "world", "settings",
      "gathering", "training", "games", "mount", "voyage", "dragon", "portal", "guard",
      "notifications", "media", "archive", "vault", "growth", "celebration", "herald-ai", "workshop",
    ],
  },
  {
    file: "sheet-3.png",
    cols: 5,
    rows: 5,
    names: [
      "raven-alt", "portal-alt", "oath-scroll-alt", "crown-alt", "satchel-alt",
      "duel-alt", "chest-alt", "banner-alt", "call-orb-alt", "envelope-alt",
      "realm-map-alt", "chronicle-alt", "scales-alt", "arena-alt", "accuracy-alt",
      "nightvale-alt", "scrying-alt", "alliance-alt", "season-alt", "tower-alt",
      "coins-alt", "alchemy", "voyage-alt", "campfire", "compass-alt",
    ],
  },
];

/* Knock out the red matte halo the generator leaves behind. */
async function despill(buf) {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;
    /* Strongly red dominant and not a warm ember tone. Ember is #e5702a, which
       carries a high green channel, so requiring green and blue to both sit far
       below red keeps real fire intact. */
    const redDominant = r > 90 && r - g > 60 && r - b > 60;
    if (redDominant && g < 90 && b < 90) data[i + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function sliceSheet(sheet) {
  const file = path.join(SHEET_DIR, sheet.file);
  if (!existsSync(file)) {
    console.log(`skip ${sheet.file}, not found`);
    return 0;
  }

  const src = sharp(file).ensureAlpha();
  const meta = await src.metadata();
  const cellW = Math.floor(meta.width / sheet.cols);
  const cellH = Math.floor(meta.height / sheet.rows);
  let written = 0;

  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      const index = row * sheet.cols + col;
      const slug = sheet.names[index];
      if (!slug) continue;

      const cell = await sharp(file)
        .ensureAlpha()
        .extract({
          left: col * cellW,
          top: row * cellH,
          width: cellW,
          height: cellH,
        })
        .png()
        .toBuffer();

      const cleaned = await despill(cell);

      /* Trim the transparent margin so every icon fills its box equally, then
         letterbox onto a square so the set lines up on a grid. */
      let trimmed;
      try {
        trimmed = await sharp(cleaned).trim({ threshold: 8 }).png().toBuffer();
      } catch {
        trimmed = cleaned;
      }

      const t = await sharp(trimmed).metadata();
      const side = Math.max(t.width ?? 1, t.height ?? 1);

      await sharp({
        create: {
          width: side,
          height: side,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: trimmed, gravity: "center" }])
        .resize(SIZE, SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT_DIR, `${slug}.png`));

      written++;
    }
  }

  console.log(`${sheet.file}: wrote ${written} icons`);
  return written;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SHEET_DIR, { recursive: true });

  let total = 0;
  for (const sheet of SHEETS) total += await sliceSheet(sheet);

  if (total === 0) {
    console.log(
      `\nNo sheets found. Drop the generated sheets into:\n  ${SHEET_DIR}\nnamed sheet-1.png, sheet-2.png, sheet-3.png, then run this again.`
    );
    return;
  }

  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".png"));
  console.log(`\n${total} slices written, ${files.length} icons in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
