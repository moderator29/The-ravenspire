/* The Ravenspire investor deck. Obsidian and forged gold, dark throughout.
   No fabricated numbers anywhere: every figure is real (repo, round terms)
   or absent. */
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  GiRaven, GiCrossedSwords, GiCastle, GiCrownCoin, GiScrollUnfurled,
  GiChainedHeart, GiShield, GiKey, GiTwoCoins, GiTreasureMap, GiOpenChest,
  GiLaurelCrown, GiSpyglass, GiFireGem,
} = require("react-icons/gi");
const { FiTrendingUp, FiUsers, FiLock, FiZap, FiCheck, FiX } = require("react-icons/fi");

// Palette
const OBS = "0F0C08";      // obsidian ground
const PANEL = "191309";    // raised panel
const PANEL2 = "221A0D";   // warmer panel
const LINE = "4A3B1E";     // gold hairline
const GOLD = "D9B040";
const GOLDB = "ECC860";    // bright gold
const BONE = "E9E0CC";
const MUT = "A99F8A";
const FAINT = "7E7461";
const EMBER = "E5702A";
const STEEL = "8B95A0";

const SERIF = "Cambria";
const SANS = "Calibri";

async function icon(Comp, color, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: "#" + color, size: px })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const icons = {
    raven: await icon(GiRaven, GOLD),
    ravenBig: await icon(GiRaven, GOLDB, 512),
    swords: await icon(GiCrossedSwords, GOLD),
    castle: await icon(GiCastle, GOLD),
    crown: await icon(GiCrownCoin, GOLD),
    scroll: await icon(GiScrollUnfurled, GOLD),
    shield: await icon(GiShield, GOLD),
    key: await icon(GiKey, GOLD),
    coins: await icon(GiTwoCoins, GOLD),
    map: await icon(GiTreasureMap, GOLD),
    chest: await icon(GiOpenChest, GOLD),
    laurel: await icon(GiLaurelCrown, GOLD),
    spyglass: await icon(GiSpyglass, GOLD),
    gem: await icon(GiFireGem, GOLD),
    up: await icon(FiTrendingUp, GOLD),
    users: await icon(FiUsers, GOLD),
    lock: await icon(FiLock, GOLD),
    zap: await icon(FiZap, GOLD),
    check: await icon(FiCheck, GOLDB),
    checkMut: await icon(FiCheck, GOLD),
    x: await icon(FiX, EMBER),
  };

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.author = "The Ravenspire";
  pres.title = "The Ravenspire";

  const W = 13.33, H = 7.5;

  function bg(slide, color = OBS) { slide.background = { color }; }

  function footer(slide, n) {
    slide.addText([{ text: "THE RAVENSPIRE", options: { color: FAINT, charSpacing: 3 } }], {
      x: 0.55, y: H - 0.42, w: 3, h: 0.3, fontFace: SANS, fontSize: 8, isTextBox: true, margin: 0,
    });
    slide.addText(String(n), {
      x: W - 0.95, y: H - 0.42, w: 0.4, h: 0.3, fontFace: SANS, fontSize: 8,
      color: FAINT, align: "right", isTextBox: true, margin: 0,
    });
  }

  function kicker(slide, text, y = 0.55) {
    slide.addText(text.toUpperCase(), {
      x: 0.55, y, w: 9, h: 0.32, fontFace: SANS, fontSize: 11, bold: true,
      color: GOLD, charSpacing: 4, isTextBox: true, margin: 0,
    });
  }

  /* Height carries two wrapped lines at 32pt with slack: the longest titles
     here measure close to one full line, and Cambria's real advance is
     narrower than the QA estimate, so the box must fit either outcome.
     Content starts at 2.15, so 1.15 of title still leaves clear air. */
  function title(slide, text, y = 0.92, w = 11.5) {
    slide.addText(text, {
      x: 0.55, y, w, h: 1.15, fontFace: SERIF, fontSize: 32, bold: true,
      color: BONE, isTextBox: true, margin: 0,
    });
  }

  function card(slide, x, y, w, h, fill = PANEL) {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, fill: { color: fill }, line: { color: LINE, width: 0.75 }, rectRadius: 0.07,
    });
  }

  /* ---------- 1. TITLE ---------- */
  {
    const s = pres.addSlide(); bg(s);
    s.addImage({ data: icons.ravenBig, x: W / 2 - 0.75, y: 1.05, w: 1.5, h: 1.5 });
    s.addText("THE RAVENSPIRE", {
      x: 0.5, y: 2.7, w: W - 1, h: 1.0, fontFace: SERIF, fontSize: 54, bold: true,
      color: GOLDB, align: "center", charSpacing: 8, isTextBox: true, margin: 0,
    });
    s.addText("Make the call. Earn your name.", {
      x: 0.5, y: 3.78, w: W - 1, h: 0.5, fontFace: SERIF, fontSize: 20, italic: true,
      color: BONE, align: "center", isTextBox: true, margin: 0,
    });
    s.addText("The competitive arena where crypto conviction earns a name that can't be bought.", {
      x: 1.5, y: 4.38, w: W - 3, h: 0.45, fontFace: SANS, fontSize: 15,
      color: MUT, align: "center", isTextBox: true, margin: 0,
    });
    card(s, W / 2 - 3.1, 5.45, 6.2, 0.62, PANEL2);
    s.addText([
      { text: "SEASON ZERO  ", options: { color: GOLD, bold: true, charSpacing: 2 } },
      { text: "the founding round · September 1 to 20, 2026", options: { color: MUT } },
    ], {
      x: W / 2 - 3.1, y: 5.45, w: 6.2, h: 0.62, fontFace: SANS, fontSize: 12.5,
      align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    footer(s, 1);
    s.addNotes("Open with the one-liner. Ravenspire is a competitive social arena: members make public, timestamped predictions (Calls), scored against real market difficulty, building a permanent reputation (Renown) inside a six-House world. Season Zero, the founding round, is live inside the product itself.");
  }

  /* ---------- 2. PROBLEM ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The problem");
    title(s, "Crypto social is extractive, and conviction has no home");
    const rows = [
      { ic: icons.x, h: "Points farms churn", b: "SocialFi pays users to show up; farmers arrive for the emission and leave the day it stops. Rewards without identity retain nobody." },
      { ic: icons.x, h: "Prediction markets are mercenary", b: "Being right pays money and builds nothing. Close the position, and nothing about you accumulates. No history, no status, no belonging." },
      { ic: icons.x, h: "Reputation is bought, botted, or fake", b: "Followers are for sale, engagement is farmed, and every leaderboard can be gamed from a browser. There is nowhere a track record is provable and permanent." },
    ];
    rows.forEach((r, i) => {
      const y = 2.15 + i * 1.55;
      card(s, 0.55, y, 12.2, 1.32);
      s.addImage({ data: r.ic, x: 0.9, y: y + 0.38, w: 0.55, h: 0.55 });
      s.addText(r.h, { x: 1.75, y: y + 0.16, w: 10.7, h: 0.4, fontFace: SERIF, fontSize: 17, bold: true, color: BONE, isTextBox: true, margin: 0 });
      s.addText(r.b, { x: 1.75, y: y + 0.58, w: 10.7, h: 0.62, fontFace: SANS, fontSize: 12.5, color: MUT, isTextBox: true, margin: 0 });
    });
    footer(s, 2);
    s.addNotes("Frame Polymarket as adjacent, not the enemy: it proved demand for prediction, but it monetizes with money, which is mercenary by design. The gap is identity.");
  }

  /* ---------- 3. INSIGHT ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The insight");
    title(s, "Money markets are mercenary. Identity retains.");
    card(s, 0.55, 2.2, 5.9, 3.6, PANEL);
    s.addText("Polymarket gives you money\nfor being right.", {
      x: 0.95, y: 2.75, w: 5.1, h: 1.2, fontFace: SERIF, fontSize: 20, color: STEEL, isTextBox: true, margin: 0,
    });
    s.addText("Position closed. Nothing remains.", {
      x: 0.95, y: 4.35, w: 5.1, h: 0.5, fontFace: SANS, fontSize: 13, italic: true, color: FAINT, isTextBox: true, margin: 0,
    });
    card(s, 6.85, 2.2, 5.9, 3.6, PANEL2);
    s.addText("Ravenspire gives you a name.", {
      x: 7.25, y: 2.75, w: 5.1, h: 0.8, fontFace: SERIF, fontSize: 20, bold: true, color: GOLDB, isTextBox: true, margin: 0,
    });
    s.addText("Renown never falls, is earned in public, and cannot be bought, transferred or farmed. It is the retention primitive Web3 skipped.", {
      x: 7.25, y: 3.6, w: 5.1, h: 1.5, fontFace: SANS, fontSize: 13.5, color: BONE, isTextBox: true, margin: 0,
    });
    s.addText("A reputation that can't be bought is the one asset a member cannot take to the next app.", {
      x: 0.55, y: 6.15, w: 12.2, h: 0.5, fontFace: SERIF, fontSize: 16, italic: true, color: GOLD, align: "center", isTextBox: true, margin: 0,
    });
    footer(s, 3);
    s.addNotes("This is the thesis slide. If they remember one contrast, it is this one.");
  }

  /* ---------- 4. PRODUCT: THE LOOP ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The product");
    title(s, "One loop, five beats, a world around it");
    const beats = [
      { ic: icons.scroll, h: "Call", b: "A public, timestamped claim. Difficulty frozen from the token's own volatility." },
      { ic: icons.spyglass, h: "Score", b: "Settled on chain identity, never a ticker. Log-scored against the frozen baseline." },
      { ic: icons.laurel, h: "Renown", b: "Permanent, monotonic reputation. Seven tiers, Smallfolk to King or Queen." },
      { ic: icons.castle, h: "House", b: "Six banners. Size-neutral scoring, weekly Clashes, computed leadership." },
      { ic: icons.crown, h: "Season", b: "A clock, a finale, a reset that banks rank into permanent record." },
    ];
    const bw = 2.28, gap = 0.2, x0 = 0.55;
    beats.forEach((b, i) => {
      const x = x0 + i * (bw + gap);
      card(s, x, 2.15, bw, 2.5, PANEL);
      s.addImage({ data: b.ic, x: x + bw / 2 - 0.3, y: 2.4, w: 0.6, h: 0.6 });
      s.addText(b.h, { x: x + 0.12, y: 3.1, w: bw - 0.24, h: 0.4, fontFace: SERIF, fontSize: 16, bold: true, color: GOLDB, align: "center", isTextBox: true, margin: 0 });
      s.addText(b.b, { x: x + 0.16, y: 3.5, w: bw - 0.32, h: 1.05, fontFace: SANS, fontSize: 10, color: MUT, align: "center", isTextBox: true, margin: 0 });
      if (i < 4) {
        s.addText("→", { x: x + bw - 0.06, y: 3.0, w: 0.35, h: 0.4, fontFace: SANS, fontSize: 18, color: GOLD, align: "center", isTextBox: true, margin: 0 });
      }
    });
    s.addText("Around the loop, one world:", {
      x: 0.55, y: 5.0, w: 12.2, h: 0.35, fontFace: SANS, fontSize: 12, bold: true, color: BONE, isTextBox: true, margin: 0 });
    s.addText("The Ravenry (social feed) · The War (battle RPG feeding House Glory) · The Herald (Claude AI over live data, cited sources) · The Vault (non-custodial embedded wallet) · Whispers, Rookery live audio, leaderboards, collectibles sealed for launch.", {
      x: 0.55, y: 5.4, w: 12.2, h: 0.85, fontFace: SANS, fontSize: 12, color: MUT, isTextBox: true, margin: 0 });
    footer(s, 4);
    s.addNotes("Demo beats live from the product, not from this slide: onboarding, a real Call with the difficulty preview, the leaderboard, the Herald answering over live data. This slide is the map.");
  }

  /* ---------- 5. BUILT AND REAL ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "Execution");
    title(s, "Built end to end, by a team of two, in months");
    const stats = [
      { v: "190+", l: "PAGES AND SURFACES" },
      { v: "120+", l: "API ROUTES, SERVER-AUTHORITATIVE" },
      { v: "889", l: "TESTS, GREEN IN CI" },
      { v: "60+", l: "DATABASE MIGRATIONS" },
    ];
    stats.forEach((t, i) => {
      const x = 0.55 + i * 3.12;
      card(s, x, 2.15, 2.92, 1.7, PANEL);
      s.addText(t.v, { x: x + 0.1, y: 2.35, w: 2.72, h: 0.8, fontFace: SERIF, fontSize: 40, bold: true, color: GOLDB, align: "center", isTextBox: true, margin: 0 });
      s.addText(t.l, { x: x + 0.15, y: 3.25, w: 2.62, h: 0.5, fontFace: SANS, fontSize: 9, color: FAINT, align: "center", charSpacing: 1.5, isTextBox: true, margin: 0 });
    });
    const rows = [
      "Integrity is enforced by the build, not by promises: real data only, real AI only, non-custodial only, server-authoritative rewards. 18 house rules run as CI checks on every commit.",
      "AI-leveraged development discipline: highest-risk logic (scoring, points, payments) carries the test coverage; an adversarial security audit found and closed the money-path exploits.",
      "Live with its founding cohort today. Retention instrumentation (activation, weekly cohorts, day 1/7/30 return) ships in the admin console, so growth claims will be measured, never asserted.",
    ];
    rows.forEach((r, i) => {
      const y = 4.25 + i * 0.85;
      s.addImage({ data: icons.check, x: 0.62, y: y + 0.05, w: 0.38, h: 0.38 });
      s.addText(r, { x: 1.2, y, w: 11.5, h: 0.8, fontFace: SANS, fontSize: 12.5, color: BONE, isTextBox: true, margin: 0 });
    });
    footer(s, 5);
    s.addNotes("The honest execution story: a two-person team shipping at funded-team speed using AI leverage plus unusually strict engineering discipline. Do not overstate users; the instrumentation exists so that Season One numbers are provable.");
  }

  /* ---------- 6. WHY NOW ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "Why now");
    title(s, "Three currents, one direction");
    const cols = [
      { ic: icons.up, h: "Prediction is the hot category", b: "Prediction markets led consumer crypto funding into 2026. Ravenspire sits beside them with the piece they lack: identity and retention." },
      { ic: icons.key, h: "Wallets went invisible", b: "Embedded non-custodial wallets (Privy) removed the seed-phrase wall. Self-custody is now a feature to market, not a tax to apologize for." },
      { ic: icons.gem, h: "Ownership that means something", b: "Speculative NFTs died; collectibles tied to play and identity are the surviving corner. Our cards are champions you actually field in the War." },
    ];
    cols.forEach((c, i) => {
      const x = 0.55 + i * 4.18;
      card(s, x, 2.2, 3.95, 4.0, PANEL);
      s.addImage({ data: c.ic, x: x + 0.35, y: 2.6, w: 0.65, h: 0.65 });
      s.addText(c.h, { x: x + 0.35, y: 3.45, w: 3.25, h: 0.85, fontFace: SERIF, fontSize: 17, bold: true, color: BONE, isTextBox: true, margin: 0 });
      s.addText(c.b, { x: x + 0.35, y: 4.35, w: 3.25, h: 1.7, fontFace: SANS, fontSize: 12, color: MUT, isTextBox: true, margin: 0 });
    });
    footer(s, 6);
    s.addNotes("Q1 2026 crypto venture funding was led by prediction markets; Animoca closed a $300M Web3 gaming fund in April 2026. The claim is directional, not a promise.");
  }

  /* ---------- 7. BUSINESS MODEL ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "Business model");
    title(s, "Commerce first, fees second, token utility last");
    const rows = [
      { ic: icons.chest, h: "The Collection (built, sealed until launch)", b: "Champion card packs with published odds and provably fair, verifiable openings; physical merch through print-on-demand. Crypto checkout is live code: Coinbase Commerce, ETH and USDC, non-custodial." },
      { ic: icons.coins, h: "Marketplace fees (next)", b: "A native secondary market for cards, member to member, signed by their own wallets, with a protocol fee. Real print caps make a real floor." },
      { ic: icons.crown, h: "$RSP utility (later, product first)", b: "Staking, entries and sinks inside the realm. 10B fixed supply. Earned balances display as POINTS until TGE; nothing is promised a price." },
    ];
    rows.forEach((r, i) => {
      const y = 2.15 + i * 1.55;
      card(s, 0.55, y, 12.2, 1.35);
      s.addImage({ data: r.ic, x: 0.9, y: y + 0.36, w: 0.6, h: 0.6 });
      s.addText(r.h, { x: 1.8, y: y + 0.14, w: 10.6, h: 0.4, fontFace: SERIF, fontSize: 16, bold: true, color: GOLDB, isTextBox: true, margin: 0 });
      s.addText(r.b, { x: 1.8, y: y + 0.56, w: 10.6, h: 0.7, fontFace: SANS, fontSize: 12, color: MUT, isTextBox: true, margin: 0 });
    });
    footer(s, 7);
    s.addNotes("Sequencing is the message: revenue paths that work without a token, then fees, then token utility. Never lead with the token.");
  }

  /* ---------- 8. MOAT ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The moat");
    title(s, "Integrity as architecture, and a world people belong to");
    const left = [
      ["Non-custodial only", "Every transfer signed by the member's own wallet. We cannot lose funds we never hold."],
      ["Server-authoritative", "Points, Glory and prices settle server-side against verified events. No trusted client anywhere."],
      ["Provably fair", "Chest draws are commit-reveal, re-verifiable in the browser. The math is published beside the odds."],
      ["Real data, real AI only", "No mock numbers, no canned model output, honest empty states. Enforced in CI, not in a promise."],
    ];
    left.forEach((r, i) => {
      const y = 2.15 + i * 1.08;
      s.addImage({ data: icons.checkMut, x: 0.62, y: y + 0.03, w: 0.34, h: 0.34 });
      s.addText(r[0], { x: 1.12, y, w: 5.3, h: 0.38, fontFace: SERIF, fontSize: 15, bold: true, color: BONE, isTextBox: true, margin: 0 });
      s.addText(r[1], { x: 1.12, y: y + 0.38, w: 5.3, h: 0.62, fontFace: SANS, fontSize: 11, color: MUT, isTextBox: true, margin: 0 });
    });
    card(s, 7.0, 2.15, 5.75, 4.2, PANEL2);
    s.addImage({ data: icons.raven, x: 7.4, y: 2.5, w: 0.7, h: 0.7 });
    s.addText("Features can be copied.\nA world cannot.", {
      x: 7.4, y: 3.4, w: 5.0, h: 1.0, fontFace: SERIF, fontSize: 20, bold: true, color: GOLDB, isTextBox: true, margin: 0 });
    s.addText("Six Houses, a realm lexicon, oath history, crests that are earned and never sold. The lore is not decoration: it is the identity system that makes leaving costly and belonging real.", {
      x: 7.4, y: 4.5, w: 5.0, h: 1.6, fontFace: SANS, fontSize: 12.5, color: BONE, isTextBox: true, margin: 0 });
    footer(s, 8);
    s.addNotes("The house rules read as product because they are: they were CI-enforced from the start. Trust is structural, not stated.");
  }

  /* ---------- 9. SEASON ZERO ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The founding round · live now");
    title(s, "Season Zero");
    const stats = [
      { v: "6 ETH", l: "SOFTCAP" },
      { v: "15 ETH", l: "HARDCAP" },
      { v: "7%", l: "OF 10B SUPPLY" },
      { v: "46,666,666", l: "$RSP PER ETH, FIXED" },
    ];
    stats.forEach((t, i) => {
      const x = 0.55 + i * 3.12;
      card(s, x, 2.1, 2.92, 1.6, PANEL2);
      s.addText(t.v, { x: x + 0.1, y: 2.3, w: 2.72, h: 0.75, fontFace: SERIF, fontSize: 30, bold: true, color: GOLDB, align: "center", isTextBox: true, margin: 0 });
      s.addText(t.l, { x: x + 0.12, y: 3.12, w: 2.68, h: 0.42, fontFace: SANS, fontSize: 9, color: FAINT, align: "center", charSpacing: 1.5, isTextBox: true, margin: 0 });
    });
    const rows = [
      "September 1 to 20, 2026 (UTC), run inside the platform itself: the round page is the product demo.",
      "Non-custodial and wallet to wallet: ETH on Base or Ethereum straight to the treasury. Every contribution verified on chain by the server; the raise total is a chain-verified sum anyone can audit.",
      "Below softcap, every contribution returns to its sending wallet. Tokens deliver at TGE. Terms and risks stated in plain language on the page.",
      "Funds: the season engine, the ownership loop, an independent audit of the money surfaces, first hires.",
    ];
    rows.forEach((r, i) => {
      const y = 4.05 + i * 0.68;
      s.addImage({ data: icons.checkMut, x: 0.62, y: y + 0.03, w: 0.32, h: 0.32 });
      s.addText(r, { x: 1.1, y, w: 11.6, h: 0.64, fontFace: SANS, fontSize: 12, color: BONE, isTextBox: true, margin: 0 });
    });
    footer(s, 9);
    s.addNotes("This is a community founding round, not a VC round: fixed rate, hard caps, full transparency, refund below softcap. The pre-seed conversation comes after Season One data; this slide shows the machine already runs.");
  }

  /* ---------- 10. TRACTION PLAN ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "Traction, measured not asserted");
    title(s, "Seasons are the growth engine");
    const cols = [
      { ic: icons.users, h: "The captains model", b: "Six recruited House captains each bring their crew into a dated season. Closed doors make early smallness intentional and founding status worth having." },
      { ic: icons.zap, h: "Shareable proof", b: "Every settled Call, season rank and pull unfurls as a share card carrying an invite. The cheapest credible acquisition is a member showing a real win." },
      { ic: icons.map, h: "The metric wall", b: "Activation, weekly cohorts, day 1/7/30 return and habit depth are instrumented today. Every future claim to investors is a screenshot of real data." },
    ];
    cols.forEach((c, i) => {
      const x = 0.55 + i * 4.18;
      card(s, x, 2.2, 3.95, 3.6, PANEL);
      s.addImage({ data: c.ic, x: x + 0.35, y: 2.55, w: 0.6, h: 0.6 });
      s.addText(c.h, { x: x + 0.35, y: 3.35, w: 3.25, h: 0.45, fontFace: SERIF, fontSize: 16, bold: true, color: BONE, isTextBox: true, margin: 0 });
      s.addText(c.b, { x: x + 0.35, y: 3.85, w: 3.25, h: 1.8, fontFace: SANS, fontSize: 11.5, color: MUT, isTextBox: true, margin: 0 });
    });
    s.addText("Season Zero funds it · Season One proves it · the pre-seed prices it.", {
      x: 0.55, y: 6.15, w: 12.2, h: 0.5, fontFace: SERIF, fontSize: 16, italic: true, color: GOLD, align: "center", isTextBox: true, margin: 0 });
    footer(s, 10);
    s.addNotes("No invented traction anywhere. The pitch is that the measurement machine exists and the seasons create the data.");
  }

  /* ---------- 11. TEAM ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The founders");
    title(s, "A builder and an operator, shipping at team speed");
    card(s, 0.55, 2.2, 5.9, 3.7, PANEL);
    s.addText("Paul", { x: 0.95, y: 2.6, w: 5.1, h: 0.5, fontFace: SERIF, fontSize: 22, bold: true, color: GOLDB, isTextBox: true, margin: 0 });
    s.addText("FOUNDER · NETHERLANDS", { x: 0.95, y: 3.15, w: 5.1, h: 0.35, fontFace: SANS, fontSize: 10, color: FAINT, charSpacing: 2, isTextBox: true, margin: 0 });
    s.addText("Vision, strategy and the realm's direction. [Add two lines: background, prior work, why this problem.]", {
      x: 0.95, y: 3.6, w: 5.1, h: 1.6, fontFace: SANS, fontSize: 12.5, color: MUT, isTextBox: true, margin: 0 });
    card(s, 6.85, 2.2, 5.9, 3.7, PANEL);
    s.addText("Co-founder", { x: 7.25, y: 2.6, w: 5.1, h: 0.5, fontFace: SERIF, fontSize: 22, bold: true, color: GOLDB, isTextBox: true, margin: 0 });
    s.addText("PRODUCT AND ENGINEERING", { x: 7.25, y: 3.15, w: 5.1, h: 0.35, fontFace: SANS, fontSize: 10, color: FAINT, charSpacing: 2, isTextBox: true, margin: 0 });
    s.addText("Years operating in Web3. Designed and shipped the entire platform end to end with AI-leveraged engineering: product, frontend, backend, chain integration and AI. [Add name and two proof points.]", {
      x: 7.25, y: 3.6, w: 5.1, h: 1.7, fontFace: SANS, fontSize: 12.5, color: MUT, isTextBox: true, margin: 0 });
    s.addText("The message a diligence team should leave with: these founders execute.", {
      x: 0.55, y: 6.2, w: 12.2, h: 0.45, fontFace: SERIF, fontSize: 15, italic: true, color: GOLD, align: "center", isTextBox: true, margin: 0 });
    footer(s, 11);
    s.addNotes("Fill the bracketed lines with real bios before any send. Never position as needing support; position as executing.");
  }

  /* ---------- 12. ROADMAP + ASK ---------- */
  {
    const s = pres.addSlide(); bg(s);
    kicker(s, "The road and the ask");
    title(s, "Three seasons to a priced round");
    const steps = [
      { h: "Now · Season Zero", b: "The founding round, live in-product. Sept 1 to 20, 2026." },
      { h: "Q4 2026 · Season One", b: "Captains model, referral-gated growth, first collectibles revenue, retention data." },
      { h: "H1 2027 · Ownership", b: "Wallet-backed cards, the native marketplace, House economies." },
      { h: "Then · TGE and pre-seed", b: "$RSP generation with utility live; a priced round on measured numbers." },
    ];
    steps.forEach((t, i) => {
      const x = 0.55 + i * 3.12;
      card(s, x, 2.15, 2.92, 2.5, i === 0 ? PANEL2 : PANEL);
      s.addText(t.h, { x: x + 0.2, y: 2.4, w: 2.52, h: 0.75, fontFace: SERIF, fontSize: 14.5, bold: true, color: i === 0 ? GOLDB : BONE, isTextBox: true, margin: 0 });
      s.addText(t.b, { x: x + 0.2, y: 3.2, w: 2.52, h: 1.3, fontFace: SANS, fontSize: 11, color: MUT, isTextBox: true, margin: 0 });
      if (i < 3) s.addText("→", { x: x + 2.86, y: 3.05, w: 0.35, h: 0.4, fontFace: SANS, fontSize: 16, color: GOLD, align: "center", isTextBox: true, margin: 0 });
    });
    card(s, 0.55, 5.15, 12.2, 1.35, PANEL2);
    s.addText([
      { text: "The ask.  ", options: { bold: true, color: GOLDB, fontFace: SERIF, fontSize: 16 } },
      { text: "Join Season Zero as a founding backer, or open the pre-seed conversation now and price it on Season One's data. Either way: theravenspire.xyz/season-zero is live, verifiable on chain, and the product is the proof.", options: { color: BONE, fontSize: 13.5 } },
    ], { x: 0.95, y: 5.3, w: 11.4, h: 1.05, fontFace: SANS, isTextBox: true, margin: 0 });
    footer(s, 12);
    s.addNotes("End on the demo, not the deck: open /season-zero live, show the chain-verified raise, then the five-minute product walkthrough.");
  }

  await pres.writeFile({ fileName: "ravenspire-pitch-deck.pptx" });
  console.log("written");
})().catch((e) => { console.error(e); process.exit(1); });
