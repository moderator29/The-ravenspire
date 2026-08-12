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
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHEET_DIR = path.join(ROOT, "public/icons/3d/_sheets");
const OUT_DIR = path.join(ROOT, "public/icons/3d");
const MANIFEST = path.join(ROOT, "components/ui/icon-3d-names.ts");
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
    /* Tight grid, icons seated low, plinths spill into the row below. Reach
       sixty percent of a cell down to recover the whole board. */
    plinthSpill: 0.6,
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
    /* The darkest, most ornate reading of the set. Held back for a while on a
       diagnosis that turned out to be wrong: it was read as an opaque brown
       gradient because every cell sliced to a full frame rectangle. The sheet
       is in fact transparent, but at an alpha of one or two rather than a
       clean zero, and the crop was keeping any pixel that was not exactly
       zero. Clearing near transparent alpha fixed it and the sheet is sound. */
    file: "sheet-3.png",
    cols: 5,
    rows: 5,
    names: [
      "raven-alt", "portal-alt", "oath-scroll-alt", "crown-alt", "satchel-alt",
      "duel-alt", "chest-alt", "banner-alt", "call-orb-alt", "envelope-alt",
      "realm-map-alt", "chronicle-alt", "scales-alt", "arena-alt", "accuracy-alt",
      "nightvale-alt", "scrying-alt", "alliance-alt", "season-alt", "tower-alt",
      "coins-alt", "alchemy", "voyage-alt", "campfire-alt", "compass-alt",
    ],
  },
  {
    /* A second pass at the primary subjects, rendered brighter and cleaner
       than sheet 1. Suffixed rather than overwriting, so both readings survive
       and a surface can pick the one that suits it. */
    file: "sheet-4.png",
    cols: 5,
    rows: 5,
    names: [
      "raven-v2", "keep-v2", "crown-v2", "oath-scroll-v2", "house-corvane-v2",
      "duel-v2", "council-v2", "banner-v2", "call-orb-v2", "chest-v2",
      "chronicle-v2", "trophy-v2", "forge-v2", "accuracy-v2", "realm-map-v2",
      "quest-scroll-v2", "scrying-v2", "scales-v2", "cards-v2", "guard-v2",
      "coins-v2", "campfire-v2", "wellspring", "envelope-v2", "tower-v2",
    ],
  },
];

/* Lift a flat background off a cell that arrived fully opaque.
 *
 * Two of the four sheets came back on transparency and two did not. Sheet 4 is
 * rendered on solid black, so slicing it produced 25 black tiles with an icon
 * in the middle: correct art, unusable as an icon anywhere that is not exactly
 * the same black.
 *
 * Keying on colour alone would be wrong, because these icons are full of black:
 * the raven's body, the banner's cloth, the chest's bands, the shield's field.
 * What separates background from artwork is not the colour, it is whether the
 * pixel is connected to the frame edge through nothing but background. So the
 * fill starts at the border and spreads only through near black, which stops
 * dead at the artwork: measured across the sheet, the background sits at a luma
 * of 0 or 1 and the darkest artwork touching it jumps to the mid thirties.
 *
 * The remaining band between the two is the antialiased edge, and it is what
 * would otherwise leave a dark rim once the icon is placed on a warm panel. It
 * is faded out proportionally rather than cut, which is what keeps the edges
 * soft instead of stepped.
 *
 * A cell that is already transparent at the border is left untouched.
 */
const BG_SOLID = 8; /* at or below this luma, definitely background */
const BG_EDGE = 26; /* above this, definitely artwork */

async function removeFlatBackground(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  const luma = (p) =>
    0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];

  /* Only act on a cell whose border is opaque. Everything else already came
     off the generator with a real alpha channel. */
  let opaqueBorder = 0;
  let sampled = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      sampled++;
      if (data[(y * w + x) * 4 + 3] > 200) opaqueBorder++;
    }
  }
  if (opaqueBorder < sampled * 0.9) return buf;

  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (p) => {
    if (!seen[p] && luma(p) <= BG_EDGE) {
      seen[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
  }

  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue;
    const l = luma(p);
    data[p * 4 + 3] =
      l <= BG_SOLID
        ? 0
        : Math.round((255 * (l - BG_SOLID)) / (BG_EDGE - BG_SOLID));
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

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
    /* Sheet 3 clears its background to an alpha of one or two rather than a
       clean zero. Invisible on screen, but it is not nothing, so the crop
       below saw content in every corner and every icon came out as a full
       frame rectangle. Anything this faint is background. */
    if (a <= 8) {
      data[i + 3] = 0;
      continue;
    }
    /* Strongly red dominant and not a warm ember tone. Ember is #e5702a, which
       carries a high green channel, so requiring green and blue to both sit far
       below red keeps real fire intact.

       The opacity test is the one that matters and was missing. The matte the
       generator leaves is a halo bled against the transparent background, so
       it is antialiased and never fully opaque. Real red artwork is: the wax
       seal on the oath scroll is solid red and was being punched into a hole
       by a filter whose own comment said it only removed partial pixels. */
    const redDominant = r > 90 && r - g > 60 && r - b > 60;
    if (redDominant && g < 90 && b < 90 && a < 170) data[i + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/* Keep the island nearest the cell centre, plus any detached fragment of it.
 *
 * The region handed in is larger than the nominal cell (grown downward to
 * recover a spilled plinth, see the extract below), so it can contain part of
 * a neighbour from the next row as well as this cell's subject. Two facts sort
 * them out. First, an icon is one connected object and a neighbour bled in from
 * across a cell border is a separate island. Second, this cell's subject is the
 * one sitting over the cell centre, while a neighbour's centroid falls far off
 * it. So flood fill every island and keep the one whose centroid is closest to
 * the centre.
 *
 * Choosing by distance to centre rather than by size is the point: when the
 * region is grown downward it can catch most of a large next row icon, and
 * "largest island" would then pick the neighbour and drop the real subject.
 * Distance to centre never does. A small size credit keeps a stray speck near
 * the centre from beating the subject, and a floor of sixty pixels ignores dust.
 */
async function keepCentreIsland(buf, cx, cy) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;
  const solid = (i) => data[i * 4 + 3] > 24;
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let current = 0;
  const sumX = [], sumY = [], size = [];
  const minX = [], minY = [], maxX = [], maxY = [];

  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !solid(start)) continue;
    let top = 0, sx = 0, sy = 0, n = 0;
    let mnx = w, mny = h, mxx = -1, mxy = -1;
    stack[top++] = start;
    label[start] = current;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      sx += x; sy += y; n++;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
      /* Four way is enough: the art is antialiased, so a genuinely connected
         shape is never diagonally hinged by a single pixel. */
      if (x > 0) { const q = p - 1; if (label[q] === -1 && solid(q)) { label[q] = current; stack[top++] = q; } }
      if (x < w - 1) { const q = p + 1; if (label[q] === -1 && solid(q)) { label[q] = current; stack[top++] = q; } }
      if (y > 0) { const q = p - w; if (label[q] === -1 && solid(q)) { label[q] = current; stack[top++] = q; } }
      if (y < h - 1) { const q = p + w; if (label[q] === -1 && solid(q)) { label[q] = current; stack[top++] = q; } }
    }
    sumX[current] = sx; sumY[current] = sy; size[current] = n;
    minX[current] = mnx; minY[current] = mny; maxX[current] = mxx; maxY[current] = mxy;
    current++;
  }
  if (current === 0) return buf;

  let best = -1, bestScore = Infinity;
  for (let l = 0; l < current; l++) {
    if (size[l] <= 60) continue;
    const gx = sumX[l] / size[l], gy = sumY[l] / size[l];
    const score = Math.hypot(gx - cx, gy - cy) - Math.sqrt(size[l]) * 0.5;
    if (score < bestScore) { bestScore = score; best = l; }
  }
  if (best === -1) return buf;

  /* Keep the chosen island, plus SMALL islands that sit clear of every frame
     edge and near its bounding box: a pennant clear of its pole, a spark above
     a flame, the tip of a quill.

     The size cap is what makes this safe. The region is grown well into the row
     below to recover a spilled plinth, so it routinely catches the top of the
     next icon, and that fragment is neither edge touching (it sits mid region)
     nor far from the subject's box. Without a cap it was kept, and scrying and
     realm-map shipped with a campfire and a hood stuck to their base. A real
     detached part of the subject is a small fraction of it; a neighbour caught
     this way is a large blob. So keep a fragment only if it is under a fifth of
     the subject, which passes every spark and pennant and rejects every
     neighbour. A neighbour that does run to an edge is already excluded. */
  const touchesEdge = new Set();
  for (let x = 0; x < w; x++) {
    if (label[x] !== -1) touchesEdge.add(label[x]);
    const b = (h - 1) * w + x;
    if (label[b] !== -1) touchesEdge.add(label[b]);
  }
  for (let y = 0; y < h; y++) {
    if (label[y * w] !== -1) touchesEdge.add(label[y * w]);
    const r = y * w + w - 1;
    if (label[r] !== -1) touchesEdge.add(label[r]);
  }

  const bx0 = minX[best], by0 = minY[best], bx1 = maxX[best], by1 = maxY[best];
  const padX = (bx1 - bx0) * 0.15, padY = (by1 - by0) * 0.15;
  const fragmentCap = size[best] * 0.2;
  const keep = new Set([best]);
  for (let l = 0; l < current; l++) {
    if (l === best || touchesEdge.has(l) || size[l] > fragmentCap) continue;
    const gx = sumX[l] / size[l], gy = sumY[l] / size[l];
    if (gx >= bx0 - padX && gx <= bx1 + padX && gy >= by0 - padY && gy <= by1 + padY) keep.add(l);
  }

  for (let i = 0; i < w * h; i++) {
    if (!keep.has(label[i])) data[i * 4 + 3] = 0;
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

/* The tight bounding box of everything not fully transparent. */
async function cropToContent(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return buf;

  return sharp(buf)
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
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
  let written = 0;

  /* Cell edges are computed per cell from the full dimension rather than from
     one floored cell size. Flooring first loses up to a pixel per column, and
     on the 8 wide sheet that accumulates to about six pixels by the last
     column, which is enough to drag a neighbour into frame.

     The region extracted is deliberately NOT the bare cell. The generator seats
     many icons low in their cell, so the stone plinth spills past the nominal
     grid line into the inter row gap below. The old cut fell on that line and,
     with a two percent inset, shaved the plinth down to a flat slab: the "board
     cut off at the bottom" the founder kept seeing. Rendered small with
     object-contain that reads as an icon standing on a chopped board.

     So the region is grown instead of inset: a little on the top and sides for
     antialias safety, and a lot below (sixty percent of a cell) to recover the
     spilled board in full. That pulls in part of the next row too, which is
     exactly what keepCentreIsland is built to discard: it keeps the island over
     the cell centre and drops the neighbour, and cropToContent re-centres on
     whatever survives. The bottom row of the sheet has no next row and simply
     clamps to the sheet edge. */
  /* Only the dense sheet needs to reach past its cell. Its eight by eight grid
     packs the art tight and seats it low, so the plinth spills past the grid
     line and has to be chased into the next row: a little top and side room for
     antialias safety, a lot below.

     The five by five sheets are the opposite case. Their plinths sit whole
     inside the cell, and reaching into the row below drags a neighbour in.
     Worse, a neighbour that is seated high pokes up into this cell, and any
     downward reach stops it running to the frame edge, which is the one thing
     that would let it be dropped. So those sheets inset instead, exactly as the
     original slice did: a two percent bite off every side that trims the seam,
     cuts a poking neighbour at the edge so it is discarded, and self corrects
     because the trim re-centres on whatever real artwork survives. */
  const spill = sheet.plinthSpill ?? 0;
  const MARGIN_SIDE = spill ? 0.1 : -0.02;
  const MARGIN_TOP = spill ? 0.1 : -0.02;
  const MARGIN_BOTTOM = spill ? spill : -0.02;

  const edge = (i, n, total) => Math.round((i * total) / n);

  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      const index = row * sheet.cols + col;
      const slug = sheet.names[index];
      if (!slug) continue;

      const x0 = edge(col, sheet.cols, meta.width);
      const x1 = edge(col + 1, sheet.cols, meta.width);
      const y0 = edge(row, sheet.rows, meta.height);
      const y1 = edge(row + 1, sheet.rows, meta.height);
      const cw = x1 - x0;
      const ch = y1 - y0;

      const left = Math.max(0, Math.round(x0 - cw * MARGIN_SIDE));
      const top = Math.max(0, Math.round(y0 - ch * MARGIN_TOP));
      const right = Math.min(meta.width, Math.round(x1 + cw * MARGIN_SIDE));
      const bottom = Math.min(meta.height, Math.round(y1 + ch * MARGIN_BOTTOM));

      const cell = await sharp(file)
        .ensureAlpha()
        .extract({
          left,
          top,
          width: right - left,
          height: bottom - top,
        })
        .png()
        .toBuffer();

      /* Cell centre expressed in the extracted region's own coordinates. */
      const cx = (x0 + x1) / 2 - left;
      const cy = (y0 + y1) / 2 - top;

      const cleaned = await keepCentreIsland(
        await despill(await removeFlatBackground(cell)),
        cx,
        cy
      );

      /* Trim the transparent margin so every icon fills its box equally, then
         letterbox onto a square so the set lines up on a grid.

         sharp's own trim() is not used. It resolves the background from the
         corner pixel and, on these cells, decided there was nothing to remove
         even though the artwork covered about a quarter of the frame, so every
         icon came out small and adrift. Measuring the alpha bounding box is
         both exact and obvious about what it does. */
      const trimmed = await cropToContent(cleaned);
      const t = await sharp(trimmed).metadata();
      const side = Math.max(t.width ?? 1, t.height ?? 1);

      /* Two passes, deliberately. sharp runs its operations in a fixed order
         and resize comes BEFORE composite, so squaring and scaling in one
         chain scaled the empty canvas to 512 and then dropped the artwork in
         at its original size, leaving every icon sitting at about a quarter of
         its frame. Squaring to a buffer first makes the order explicit. */
      const squared = await sharp({
        create: {
          width: side,
          height: side,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: trimmed, gravity: "center" }])
        .png()
        .toBuffer();

      /* Full colour, not a palette.
       *
       * Quantising was the right call when every icon was being written at
       * 512, because full RGBA ran about 400KB each and the set was 34MB. It
       * is the wrong call now that icons are written at their native size:
       * 256 colours across a gold gradient with a soft glow is exactly the
       * content that bands, and these icons are almost entirely gradient.
       * At 150 to 250 pixels the full colour file is small anyway.
       *
       * The sharpen is the other half. Any resample softens edges slightly,
       * and the browser softens them again when it draws a 150px icon into a
       * 192px hero box. A light unsharp mask, well below the threshold where
       * it starts ringing on the gold rims, puts that back. */
      /* Never scaled up. The sheets arrive at 1254 across, so a cell on the
         eight wide sheet is about 156 pixels: writing that out at 512 stores
         three times the bytes and not one extra pixel of detail, and an
         upscale is where a crisp icon turns soft. Cap at 512 and otherwise
         keep native, so what ships is exactly what was drawn. */
      const out = Math.min(SIZE, side);

      await sharp(squared)
        .resize(out, out, {
          fit: "contain",
          kernel: "lanczos3",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .sharpen({ sigma: 0.7, m1: 0.6, m2: 1.4 })
        .png({ compressionLevel: 9, effort: 10 })
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
  const slugs = files.map((f) => f.replace(/\.png$/, "")).sort();

  /* The name union is generated rather than hand kept. It drifted twice while
     this script was being fixed, once leaving three slugs typed that had no
     file behind them and once leaving fifty files that nothing could reference
     because the type did not name them. Deriving it from what actually landed
     on disk makes that class of drift impossible. */
  await writeFile(
    MANIFEST,
    `/* Generated by scripts/slice-icons.mjs. Do not edit.
   Run \`npm run icons\` to regenerate after changing the sheets. */

export const ICON_3D_NAMES = [
${slugs.map((s) => `  "${s}",`).join("\n")}
] as const;

export type Icon3DName = (typeof ICON_3D_NAMES)[number];
`,
    "utf8"
  );

  console.log(`\n${total} slices written, ${files.length} icons in ${OUT_DIR}`);
  console.log(`name union written to ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
