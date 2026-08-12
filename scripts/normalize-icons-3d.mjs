// Normalise the 3D icon set to consistent padding.
//
// WHY
// The pack was generated in batches and the batches disagree about margin. A
// measurement of all 114 files found 33 sitting flush against the bottom pixel
// edge (bottom margin 0), most of them the newest -v2 variants, while others
// carry 15 to 20 percent margin. Rendered at one fixed box size with
// object-contain, the flush ones fill the box edge to edge, so their plinth
// has no room, reads as cut off, and is clipped outright by any ancestor with
// overflow-hidden or a rounded frame. That is the "you didn't slice well" the
// founder saw. The generous ones, by contrast, float small in the middle of
// their box. The set never agreed with itself.
//
// WHAT
// For each PNG: trim to its true alpha bounding box, then re-pad onto a square
// canvas so the content occupies a fixed fraction, centred. This is a lossless
// transform of the existing pixels, no repaint and no invention: every
// coloured pixel is preserved exactly, only transparent margin is added or
// removed. After it, every icon has the same breathing room and no base is
// flush against an edge, so none is clipped whatever frames it.
//
// The target fraction is generous on purpose (72 percent of the box), so the
// whole object AND the board it sits on are unmistakably in frame with room
// to spare, never touching an edge. Content is centred by its own bounding
// box, so a tall object and a squat one both sit correctly.

import sharp from "sharp";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "public/icons/3d";
// Content fills this fraction of the square canvas; the rest is even margin.
const CONTENT_FRACTION = 0.72;

async function alphaBounds(buf, W, H, C) {
  let top = H,
    bot = -1,
    left = W,
    right = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * C + 3] > 10) {
        if (y < top) top = y;
        if (y > bot) bot = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bot < 0) return null;
  return { left, top, right, bot };
}

async function normalise(file) {
  const path = join(DIR, file);
  const src = sharp(path);
  const { data, info } = await src
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const b = await alphaBounds(data, W, H, C);
  if (!b) return { file, skipped: "empty" };

  const contentW = b.right - b.left + 1;
  const contentH = b.bot - b.top + 1;
  const contentSize = Math.max(contentW, contentH);

  // The square canvas that puts the content at CONTENT_FRACTION of the box.
  const canvas = Math.round(contentSize / CONTENT_FRACTION);
  const marginBefore = H - 1 - b.bot;

  // Extract the exact content rectangle, then extend it with transparent
  // margin, centred, to the square canvas. extract + extend both preserve the
  // original pixels; nothing is scaled.
  const content = await sharp(path)
    .extract({
      left: b.left,
      top: b.top,
      width: contentW,
      height: contentH,
    })
    .toBuffer();

  const padLeft = Math.round((canvas - contentW) / 2);
  const padRight = canvas - contentW - padLeft;
  const padTop = Math.round((canvas - contentH) / 2);
  const padBottom = canvas - contentH - padTop;

  await sharp(content)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path + ".tmp");

  // Atomic replace so a crash never leaves a half written asset.
  const { rename } = await import("node:fs/promises");
  await rename(path + ".tmp", path);

  return {
    file,
    from: `${W}x${H} bm=${marginBefore}`,
    to: `${canvas}x${canvas} bm=${padBottom}`,
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".png"));
const only = process.argv[2]; // optional single file, for a dry look
let changed = 0;
for (const f of files) {
  if (only && f !== only) continue;
  const r = await normalise(f);
  if (r.to) changed++;
  console.log(`${f.padEnd(24)} ${r.skipped ?? `${r.from}  ->  ${r.to}`}`);
}
console.log(`\nnormalised ${changed} of ${files.length}`);
