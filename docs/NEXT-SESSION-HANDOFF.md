# The Ravenspire, Next-Session Handoff

This is the single source of truth for whoever picks up The Ravenspire next.
Read it fully before writing code. It captures the founder's rules and style,
the features to build next (the in-app Scrying trading + Swap, fully specced
from the founder's reference images), and the live bug list with what is done
and what remains.

Live site: ravenspire.vercel.app (production tracks `main`). Work on branch
`claude/clean-repo-setup-9erdzt`, open a PR to `main`, merge to ship.

---

## 0. IMMEDIATE NEXT BATCH (do these first)

The founder handed off this exact batch. Build all of it, slick and clean, then
ship to production.

1. Comments parity with posts. A comment must support: reply-to-comment,
   like, bookmark, share, and tip, with threading, exactly like posts.
   Files: components/social/comment-card.tsx (and the comment thread on
   /post/[id]), app/api/comments, app/api/social (reactions already keyed by
   subject_type = "comment"), app/api/bookmarks (comment_bookmarks exists),
   app/api/tips (subject_type "comment"). Seed per-viewer state for comments the
   same way posts now do (see attachViewerFlags in lib/social/queries.ts).

2. @raven in comment threads. When a member tags @raven in a comment, or
   replies to a reply @raven made, @raven auto-replies to THAT comment and the
   thread flows naturally. Reuse maybeRavenReplyToPost-style plumbing for
   comments (app/api/comments + lib raven helpers). Keep it real-data, realm
   voice.

3. Bigger action icons. The like/repost/bookmark/share/tip icons in
   post-card (and the new comment-card) are a touch too small; bump the icon and
   hit-area size a step. Bookmark stays in the header corner.

4. Vault redesign. Rework The Vault (app/(shell)/vault, components/wallet/**)
   to a true Trust Wallet / Exodus / MetaMask / Crypto.com feel. Move
   recovery/key-export into settings, add more vault settings, and add a
   Referral earnings tab beneath the Send/Receive/Swap row. EVM 0x address only,
   never Solana.

5. Profile edit + X logo placement. Move the Edit Profile button out of the
   bottom of the profile into the Keep header. Show the X LOGO (bigger) next to
   the member's NAME, not next to the @username, and never render the X handle
   as the display name. Also fix the other-profile banner rendering ON TOP of
   the avatar (banner behind, avatar in front). See components/social/profile-view.tsx.

---

## 1. Founder rules (non-negotiable)

- NO em-dashes anywhere. Use commas, periods, or restructure.
- NO emojis as icons. Use the `Icon` / `LandingIcon` components only.
- Premium, next-gen, cinematic UI. Obsidian and forged gold, restrained ember,
  a single steel tone. Never green in brand surfaces (trading up/down may use
  gold for up and ember for down, never green).
- Real data only. Never fabricate numbers, balances, charts, or history. Sparse
  state gets an honest empty message, never invented figures.
- Non-custodial only. Every value transfer is signed by the member's own Privy
  embedded wallet. The Ravenspire never takes custody and never holds keys.
- Ticker is `$RSP`. Total supply 10,000,000,000 (10B).
- "Presale coming soon" everywhere. Never "no presale".
- Members earn POINTS through real actions. Points convert to $RSP at TGE.
  Show points, not $RSP, for earned balances.
- Realm lexicon: The Ravenry (feed), The Crossroads (explore), The Rookery
  (live), Whispers (DMs), The Vault (wallet), The Coffers (earnings/treasury),
  The Ledger (portfolio), The Scrying Glass (coin discovery), Claim the Throne
  and The War (games), @raven (the Herald AI), Houses, Renown, Glory, Calls.
- Filters and settings must never scatter the layout. Popovers anchor to their
  own button in a `relative` box with a fixed click-catcher backdrop, or open on
  their own page. Heavy settings get their own page.
- Every page/section/tab that can be navigated into needs a back control.

## 2. Tokenomics (final, already in components/landing/tokenomics.tsx)

Presale 20, Liquidity 25, Team 10, Staking & Farming 12, P2E/Post2Earn &
Rewards 10, Ecosystem & CEX Growth 18, Airdrop 5. Chain: Ethereum.

## 3. Tech map

- Next.js 16 App Router, TypeScript strict, Tailwind v4, Framer Motion, Canvas.
- Supabase project `tqvigouaifbklvajiyoj` (RLS on; service-role `adminClient`).
- Auth: Privy embedded EVM wallets. Client calls attach the Privy bearer token
  via `realmFetch` (lib/auth/api.ts). Server: `requireProfile`/`getProfile`/
  `json` (lib/auth/server.ts). NEVER use plain `fetch` for authed routes; use
  `realmFetch` or the token will not be attached (this was the @raven 401 bug).
- Balances: GoldRush/Covalent via app/api/wallet/balances (GOLDRUSH_API_KEY),
  read through `useWalletTokens` (components/wallet/use-wallet-tokens).
- Prices/charts: DexScreener + GeckoTerminal (see lib/data/tokens.ts,
  app/api/scrying, app/api/coin). Non-custodial coin pages live at /coin/[address].
- @raven: Anthropic claude-sonnet-5 (app/api/raven).
- Modals that must overlay the whole screen MUST portal to document.body, or a
  transformed card ancestor pins them to the top (this was the tip-modal bug;
  fixed in components/tip/tip-dialog.tsx, use it as the pattern).

---

## 4. NEXT BUILD: The Scrying Glass in-app trading + The Swap

The founder wants members to buy, sell and swap EVM coins inside the platform,
non-custodially, with a 0.5% platform fee, using the 0x Swap API (API key is
provisioned by the founder). Put the whole surface in BETA (a beta badge on the
Scrying Glass and the Swap). EVM chains ONLY. No Solana anywhere (the founder is
currently seeing Solana coins in the Scrying Glass, which must be filtered out).

Reference vibe: a Vector/Photon-style coin terminal, rebuilt entirely in our
obsidian-and-gold design (not cloned). The founder's reference images show the
structure; match the flow, not the look.

### 4.1 Scrying Glass (discovery) source and filter

- Source coins from EVM chains only (ethereum, base, arbitrum, bsc, polygon,
  avalanche, optimism). Drop Solana and non-EVM entirely.
- Quality filter for what appears: minimum liquidity ~$10k, minimum market cap
  ~$40k. Tune constants in one place and log when coins are dropped.
- Top of the Scrying Glass: top coins by big volume (trending/high-volume EVM
  coins). Below: the filtered discovery list.
- Every row: real logo (already done via TokenLogo), a watchlist star (done),
  and it opens the in-app coin page (done, /coin/[address]). Add a beta badge.

### 4.2 In-app coin page (/coin/[address]) trading panel

Extend the existing coin page with a trading panel modeled on the reference:

- Risk banners: "Unverified coin. Anyone can launch a coin, trade with caution."
  and a rug-risk read where derivable (liquidity, age, holder concentration).
  Honest, real signals only.
- A per-coin @raven take: a short AI analysis of the coin ("The Raven's read"),
  with a Read/expand. Reuse the /api/raven plumbing with a coin context.
- Trade tabs: Buy | Sell (Limit/DCA can be later, stub as "coming soon" beta).
- Preset amounts ($10 / $25 / $50 / $100) plus a custom field.
- "Pay about X ETH ($amount)" and "You receive N TOKEN", quoted live from 0x.
- Primary action "Buy TOKEN" (in our gold, not green).
- Top-up: "To buy TOKEN you need <gas/quote token> on <chain>. Add it with a
  card in a tap." plus a "Top up with card" button (MoonPay or similar on-ramp).
- Footer: "Signed by your own wallet. Non-custodial. 0.5% fee."
- Social: "Alert me when they buy" for accounts I follow / proven traders.

### 4.3 The Swap (new surface next to the Scrying Glass)

- A dedicated Swap page. Pull ALL coins across EVM chains; search any coin on
  any EVM chain by name/symbol/address. EVM only.
- From/To token selectors, amount, live 0x quote, price impact, min received,
  route, our 0.5% fee shown explicitly, gas estimate.
- Cross-chain intent: if the member holds ETH but wants a BNB-chain token, guide
  them to swap or to the card top-up (they cannot pay directly across chains).
- Preview page then a success page, both in our design language.

### 4.4 On-ramp (Top up with card)

- MoonPay (or an alternative the next session evaluates) to buy the needed gas/
  quote token with a card. Buying a coin via card shows in transaction history
  on-platform; the coin balance then auto-appears in The Vault and The Coffers
  holdings.

### 4.5 Holdings, history, watchlist wiring

- Every buy, sell and swap writes to transaction history (wallet history AND the
  platform transaction feed) with the real tx hash, and updates The Vault and
  The Coffers holdings automatically.
- Watchlist hooks into the same coin pages (star, already built).

### 4.6 Implementation notes

- 0x Swap API for quotes and calldata; the member's Privy wallet signs and sends
  the transaction (non-custodial). Collect the 0.5% fee via 0x's fee params
  (feeRecipient + buyTokenPercentageFee) so it is transparent and on-chain.
- Success and preview screens reuse the tip success-card pattern
  (components/tip/tip-success-card.tsx) and the full-page portal pattern.
- Everything EVM-only. Guard every code path against Solana tokens.

---

## 5. Bug list: done vs remaining

### Shipped this session (on main)

- Reactions idempotent: per-viewer liked/reposted/bookmarked flags stamped by
  the feed/profile queries; post-card seeds from them; a returning member cannot
  re-like/re-repost/re-bookmark. Repost endpoint is a proper toggle. (Server was
  already idempotent via reactions PK, reposts PK, bookmarks upsert; the bug was
  purely the client not loading state.)
- The Coffers: shows POINTS earned (not $RSP) with convert-at-TGE note; owner
  wallet balance reads the real live embedded-wallet total (no fake reserve);
  earnings chart gained candle/volume bars; tighter container.
- Profile "..." menu anchored to its dots button so opening never moves Follow;
  all four options render fully.
- Feed filter moved to its own line above the tabs (no overlap with Signal/Latest).
- Tip opens as a full-page portal sheet (was pinned to the top inside a
  transformed card ancestor).
- War game: continuous foe streaming (no dead pauses), auto-fighting hero,
  legible army-cleared bar, results show battles won and total war Glory.
- Landing roadmap: detailed 10-phase march with preview + view more.
- @raven auth fixed (realmFetch). Scrying in-app coin pages. Ledger portfolio.
- Whispers: recipient avatar in the thread header, on bubbles, AND in the
  conversation list; header links to /u/handle; image send fixed (media check
  now matches the storage path segment); image-only whispers allowed.
- Explore: people to follow lead the Crossroads.
- Side nav: removed The Ravenry and The Crossroads (already in bottom nav).
- iOS input zoom fixed (16px min on form controls under 640px).
- Copy: "no presale" -> "Presale coming soon".

### Remaining (verify against the live site first, then fix)

Social / feed / comments
- Comments need full parity with posts: reply to a comment, like/bookmark/share/
  tip a comment, and threading. @raven must reply in comment threads: when a
  member tags @raven in a comment (or replies to @raven's reply), @raven auto-
  replies to that specific comment and the thread flows. (Partial threading and
  threaded @raven exist; audit and complete.)
- Make the like/repost/bookmark/share/tip icons a touch bigger (founder finds
  the current size annoying). Bookmark stays in the header corner.
- Image posts: confirm end-to-end that an image added in the composer previews
  (not a black box) AND appears in the feed after posting. The media check was
  the storage-path bug (fixed for whispers and posts); re-verify posts on the
  live site. Add "views" with a unique counting icon (view count already renders;
  confirm it increments).
- On a Call post, show a lightweight real candlestick/line chart of the called
  coin next to it (CallChart exists; make it candlestick and slick).

Profile / Keep / identity
- Edit Profile button is stranded at the bottom of the profile; move it to a
  sensible place in the Keep header.
- X presence: show the X LOGO (bigger) next to the member's NAME, not next to
  the @username, and never render the X handle as the username.
- On another member's profile the banner renders ON TOP of the avatar; the
  banner must sit behind and the avatar in front. Pull the member's real X
  banner and X avatar (note: Privy exposes X name/handle/photo but NOT the X
  banner; if the banner cannot be pulled, document the limitation in the UI
  rather than leaving it broken).
- Remove Sign out from the profile area; it belongs only in deep settings.

Wallet (The Vault)
- Redesign to a true Trust Wallet / Exodus / MetaMask / Crypto.com feel; the
  current one still reads wrong to the founder. Recovery/export moves into
  settings; add more vault settings. Add a Referral earnings tab beneath the
  Send/Receive/Swap row. EVM address only (0x), never a Solana address.

Navigation / shell
- Notifications: put a notifications entry in the side nav.
- Logo: confirm the mobile top-bar mark is dead center (it is absolutely
  centered in code; verify on device).
- The floating "+" compose button must show ONLY on /home, never on feature
  pages (it is gated to /home in components/shell/floating-compose.tsx; verify no
  second compose affordance leaks onto other pages).
- Add back controls to every page/tab/section that lacks one (settings subpages,
  tools, etc.).
- Add a Staking/Farming entry in the nav with a light "coming soon" info page
  (no APY yet), slick and on-brand.

Landing
- "Discover the realm" must open the docs (/chronicle); verify the link works.
- Game character art on the landing is blurry and has names burned into the
  image; use crisp art and move names to an info area below the image.
- Champions/games section: make one game show as "coming soon" with a sneak-peek
  (founder suggests Claim the Throne as the coming-soon teaser with a peek of how
  it will look), and add ~2 more cool coming-soon features to build presale hype.
- Investigate the founder's report of a broken "right side nav" on the landing;
  the landing (app/page.tsx) has only the top LandingNav and no right rail, so
  get a fresh screenshot to pin down exactly which element they mean.

@raven
- Confirm the input bar sits at the BOTTOM (ChatGPT-style) with history and a
  full settings tab (voice filters, browse, length, etc.). Recent work moved the
  bar to the bottom; verify on the live site and deepen settings.

The Chronicle (in-app docs)
- Update to reflect everything now on the platform (Coffers, Ledger, Scrying,
  war changes, points-to-$RSP, presale-coming-soon, tokenomics).

## 6. Suggested order for the next session

1. Verify the shipped fixes on the live site (many founder complaints were about
   stale production before the last merges).
2. Scrying/Swap trading (Section 4): the big presale-driver. Beta badge, EVM
   only, 0.5% fee via 0x, per-coin @raven take, top-up, holdings/history wiring.
3. Comments parity + @raven comment threading; bigger action icons.
4. Wallet redesign + referral earnings tab + settings depth.
5. Profile polish (edit button, X logo/banner, banner-behind-avatar, sign-out).
6. Landing polish (docs link, crisp game art, coming-soon teasers, staking nav).
7. Chronicle docs refresh.

Keep commits small and frequent, typecheck and build before each push, and merge
to main so the founder always tests current production.
