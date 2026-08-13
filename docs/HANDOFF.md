# Handoff: take the upgrade work forward

You are picking up Ravenspire as a co-founder, not a contractor. Read this once,
top to bottom, then start. You do not need permission to begin and you do not
stop to ask. You decide, you build, you verify, you commit, you push, you keep
going. The only things you do not decide are the handful of founder only
business calls listed at the end, and you never block on those: you build the
work sealed and ready so a single yes ships it.

## 0. How you work (the operating protocol, non negotiable)

- **Autonomous.** No stopping to ask "should I proceed." Proceed. Make the
  technical and design decisions a senior co-founder would make, and record why
  in the commit and the code comments. Surface a question only for a genuine
  founder only business decision (the list in section 8), and even then keep
  building around it rather than waiting.
- **Co-founder standard.** Think like the top one percent of researchers, devs
  and analysts. Build to production quality. Where you see a better approach than
  what is written here, take it, and say why. Leave the codebase better than you
  found it.
- **The rules are compulsory** (section 1). They are not style preferences. CI
  enforces two of the gates and the house rule checker enforces fourteen more.
  Read `AGENTS.md` and `docs/DESIGN-SYSTEM.md` before you design any surface.
- **Every push is gated.** Run all four before you push, and never push red:
  `npm run check:rules`, `npm run typecheck`, `npm test`, `npm run build`.
- **Commit cleanly, in slices.** One coherent change per commit, a real message,
  no em dashes anywhere, and never the model identifier in any commit or artifact.
  End commit messages with the co-author and session trailer already used on this
  branch (see `git log`).
- **Branch.** Develop on `claude/ravenspire-v2-living-realm-a5b06e` unless its pull
  request is already merged, in which case restart it from the latest default
  branch and keep the name. If you fan work out to subagents, give each its own
  worktree and branch, then re-audit their diffs yourself before you merge:
  read the actual diff, do not trust the report, run the four gates on the
  integrated result, and for money or security code run the Supabase security
  advisor after any DDL.
- **Real, honest, sealed.** New surfaces ship sealed behind a realm flag until
  they are real. An empty state is honest; invented data is not, ever.

## 1. The compulsory rules (acknowledged, from AGENTS.md)

These bind every file, every commit, every subagent you spawn.

1. No em dashes or en dash punctuation anywhere: code, comments, commits, UI copy,
   docs. Use commas, periods, colons, or restructure.
2. No emoji as icons. Use the `Icon` component. Never label a 3D icon with its name.
3. Realm lexicon: The Ravenry (feed), The Crossroads (explore), The Rookery
   (live), Whispers (DMs), The Vault (wallet), The Coffers (earnings), The Ledger
   (portfolio), The Scrying Glass (coin discovery), The War (game), @raven (the
   Herald AI), Houses, Renown, Glory, Calls, Crests, Keeps.
4. **Real data only.** No mock, placeholder, seeded, demo, or invented data. Every
   number, balance, chart, holding and list is real or an honest empty state. Hard
   line.
5. **Real AI only.** Every AI surface is a real Anthropic call over real data.
   Never fake, stub, canned, or hardcoded model output.
6. **Non custodial only.** Every value transfer is signed by the member's own Privy
   embedded wallet. The platform never takes custody and never holds keys.
7. Ticker `$RSP`, supply 10,000,000,000. Presale is external launchpad only, never
   on platform. Copy is always "Presale coming soon". Show POINTS for earned
   balances, never `$RSP` amounts.
8. **Server authoritative rewards.** Points and Glory settle on the server against
   verified events. Never trust the client.
9. Buttons and controls are clean rounded rectangles. No `rounded-full` on buttons,
   tabs, nav, or chips. Radius comes from the scale.
10. Use the token scales in `app/globals.css` for spacing, radius, elevation, z
    index. No one off `z-[93]` or `rounded-[13px]` (checked).
11. Every colour that carries text clears WCAG AA (4.5:1). Never text on a fill only
    hue (`--foe`, `--blood`, `--ash`); use their `-text` twins.
12. Every interactive element is keyboard reachable and visibly focusable. Never
    add `focus:outline-none` without a replacement.
13. Brand is obsidian and forged gold (gold is a gradient, never flat), restrained
    ember, one steel tone, warm glows. Never green in brand surfaces, including
    success, which uses gold. Trading up may use gold, down may use ember.
14. Motion is fast: 100 to 150ms micro, 150 to 250ms standard, under 300ms always,
    exits about twenty percent faster, animate only transform and opacity.
15. Responsive is different layouts, not a scaled one. Distinct mobile and desktop.
16. Every navigable surface has a back control. Modals portal to `document.body`.
    Popovers anchor to their trigger in a `relative` box.
17. `npm run typecheck` and `npm run build` must both pass before any push. CI
    enforces both, and the workflow also runs the rule checker and the tests.
18. Prefer the primitives in `components/ui/`. If one is missing, add it there.
19. No new paid service without justification. Prefer free tiers, open source,
    browser native. Assume the budget is zero.
20. Read `docs/DESIGN-SYSTEM.md` before designing any surface. Two registers
    (Ledger and Forge), six archetypes, three tab patterns, two densities, one
    card chassis.
21. Ornament is earned, never ambient. The Ledger register (about ninety percent
    of the product) is flat, dense, quiet. The Forge register (Crest unlocks, Call
    resolutions, House victories, pack opening, onboarding) is where gold, 3D
    icons, glow and heavy motion are allowed.
22. Never caption a 3D icon with its own name.

## 2. Where the product stands right now

Branch `claude/ravenspire-v2-living-realm-a5b06e`, all four gates green, pushed.
The live Supabase project is `tqvigouaifbklvajiyoj`.

**The core platform is live:** the Ravenry feed, Calls (composer and
`calls/[id]` detail), Houses, The War, the Herald AI (knows the member and the
platform, real CoinGecko and GeckoTerminal data), the Vault, Swap, Watch,
Whispers. The design system sweep, mobile shell, WCAG contrast and focus rings,
and the core security fixes are done.

**The collectibles realm is built as a sealed preview and, this wave, a real
backend:** The Reliquary, Warchests, and The Mercer pages exist sealed. The
commerce engine backend is complete and sealed behind two switches, the
`chests_live` realm flag and the `COMMERCE_PRICES_CONFIRMED` env gate, both off.

**What shipped this wave** (detail in `RAVENSPIRE-V2.md` section 35): the 3D icon
slice fix, the commerce engine (Stripe provider, server authoritative checkout,
provably fair opening, non custodial redemption, fulfillment abstraction, the
`20260812130000_commerce_engine.sql` migration applied to the live database), and
a money safety pass. The `cx` defect, durable rate limiting, and four gate CI
were already done and were verified, not rebuilt.

**The strategy that drives your work** is in `docs/RAVENSPIRE-V2-STRATEGY.md`, and
the consolidated todo is `RAVENSPIRE-V2.md` Part Three (sections 35 to 40).

## 3. Your mission: the big upgrade work

Close the retention loop and give the collectibles real weight. The loop is
Earn, Own, Spend and Stake, Show. The platform has Earn and half of Own. Your job
is to build the rest. Take these in order; each is a slice you build, gate,
commit, push, then move on. Full reasoning per item is in the strategy doc.

1. **Close the ownership loop.** Make a pulled or redeemed card a real, owned,
   non custodial holding in the member's own Privy wallet, with a soulbound tier
   for earned Crests that cannot be sold. The off chain holdings ledger
   (`inventory` table) already exists and is written by opening and redemption;
   build the ownership surface on top and the path to on chain ownership. Blend:
   the Reliquary becomes a real collection, the Keep shows owned rarities, the War
   plays cards the member owns. Acceptance: a member can see and prove what they
   own, real data only, non custodial.
2. **The trophy case (the Show beat).** A surface in the Keep and the Vault that
   shows owned cards by rarity, won Crests, House standing, and the rarest holding,
   all real or an honest empty state. Cheapest retention on the table. Use the one
   card chassis at every size.
3. **Sinks and stakes (the Spend beat).** Crafting duplicates up a rarity, Call
   entries with a stake, House treasury contributions that buy House perks,
   cosmetic Crest frames. Server authoritative throughout. This gives Glory and
   POINTS somewhere to go.
4. **Native secondary market.** List, buy, gift, transfer, member to member, each
   signed by the member's own wallet, a small protocol fee to the Coffers, real
   print caps for a real floor. Non custodial, never take custody.
5. **Appointment mechanics and seasons.** A daily Warchest window, a weekly House
   Clash clock with a settlement time, a season finale that banks rank into a
   permanent badge. Give the Chronicle, the Clash and Calls a clock.
6. **Provably fair as a feature.** A public verifier page and the reveal affordance
   on the Ceremony, with the floor and expected value published beside the odds.
   The opening already reveals the seed and nonce; build the surface that lets a
   member verify a pull, and pre commit a rotating seed for the stronger guarantee.
7. **Phygital authenticity.** NFC or QR on the physical King's Reliquary box tying
   printed cards to their digital twins, provenance that survives resale.
8. **The Herald as retention brain.** A personal weekly brief grounded in real
   data, surfaced as a notification. Real AI over real data.
9. **Creator and House economies.** House treasuries that accrue a slice of market
   fees, Renown that unlocks issuing Calls.
10. **Native distribution wedges.** Shareable real artifacts (a Call result, a pull
    reveal, a season rank), each a portrait carrying an invite. Extend the existing
    opengraph image route.
11. **Gasless, forgiving non custodial UX.** Account abstraction on Privy: a
    paymaster for gasless pulls and claims, social recovery, a member set spending
    cap.
12. **Compliance guardrails** before commerce takes a dollar: alternative means of
    entry, age gate, spending caps, cooling off, geo awareness, the verifier page.

## 4. The remaining build from this wave (finish these too)

Sealed while the flag is off. Detail in `RAVENSPIRE-V2.md` section 38.

1. Commerce frontend: purchase and checkout UI in Warchests, order history in The
   Vault (`GET /api/commerce/orders` is ready), the pack opening Ceremony in the
   Forge register, redemption code UI. Distinct mobile and desktop.
2. Redemption code creation (admin or pack time): generate a code, store its hash
   plus the granted cards plus the chest sku. The redeem route consumes codes;
   nothing mints them yet.
3. Physical fulfillment: collect a shipping address at checkout, and a worker that
   calls the fulfillment vendor on the pending `fulfillments` row.
4. Refunds: `payments.status` supports `refunded`; there is no refund route yet.
5. Error monitoring (Sentry free), structured logging, a Supabase backup and PITR
   note, an image CDN policy for card art.
6. Onboarding steps 0 and 1, Whispers realtime UI, image attachment flows.

## 5. Security residuals to fix as you pass through (from the audit and re-audit)

Detail in `RAVENSPIRE-V2.md` section 39. Highest value first. Items 1, 2 and 5
are being handled in the parallel hardening pass this wave; confirm they landed
on the branch before you start, and if they did not, they are yours.

1. Move chest claim, roll and grant into one transactional RPC, or reset
   `opened_at` on failure, so a database error mid open never burns a paid chest.
2. A server side daily War Glory cap (mirroring the two hundred per day social cap),
   or seed based replay verification, since War Glory is self reported.
5. Align the redeem route comment with its code (the `attempts` bump).

### Deliberately deferred this wave, now queued for YOU (build both)

These two were held back on purpose and handed to you. They are real work, not
optional notes.

A. **Pre committed, rotating provably fair seed.** Today the chest open generates
   the server seed and rolls in one request, so a hostile server could grind
   seeds. Redesign it as a true commit reveal across two steps: the server
   commits `sha256(serverSeed)` for the member's next open in one request (a seed
   is reserved per entitlement and its hash shown before the client seed is
   fixed), then the open request reveals it and rolls. This changes the open UX
   contract into two steps, which is exactly why it was not done beside the
   Ceremony UI: coordinate the contract change with the Ceremony you inherit.
   Acceptance: a member sees the commitment hash before they choose their client
   seed, and can still replay and verify after.

B. **On chain verification of `tx_hash` on tips and trades.** `/api/tips` and
   `/api/trade/record` record a client supplied transaction hash the server never
   verifies, so within the rate limit a script can post fabricated trades and
   tributes as fake social proof. Verify the receipt (correct token, amount,
   recipient, confirmations) against an EVM RPC before recording. This needs an
   RPC provider: prefer a free tier (rule 19), and gate the verification on the
   provider env so it degrades honestly when absent. Until it lands the rate
   limit is the only mitigation.

## 6. How the money and security code is shaped (so you extend it safely)

- Money is integer minor units everywhere (`lib/commerce/money.ts`). No float ever
  reaches a charge. Keep it that way.
- Prices, supply caps and the confirmation gate live server only in
  `lib/commerce/catalog.ts`. Never render a price a client can read until it is
  confirmed. Checkout prices from the catalog, never from the request.
- The Stripe provider (`lib/commerce/payments/stripe.ts`) verifies the webhook
  signature over the raw body with a five minute replay window, secret server only.
  Any new provider implements the same `PaymentProvider` interface.
- Chest opening (`lib/commerce/chest-open.ts`) is a pure, deterministic commit
  reveal against the single odds source in `lib/collectibles/warchests.ts`. The
  route claims one entitlement with a conditional update so two opens cannot both
  win, and enforces the printed guarantee floor server side.
- Every new user owned table is RLS deny by default with ownership enforced in the
  route via the service role, because Privy makes `auth.uid()` null. Run the
  Supabase security advisor after any DDL and expect only INFO
  `rls_enabled_no_policy` lints.
- Every mutating or expensive route carries a durable rate limit
  (`rateLimit(profileKey(action, profile.id), limit, windowSeconds)`).

## 7. Item 7, decided

Stored server side in `lib/commerce/catalog.ts`, off customer surfaces until
confirmed. Chest pricing 34.99, 41.00, 54.86 USD. One print on demand vendor,
Gelato, with Printful and Prodigi fallbacks behind a swappable abstraction. Per
card mint caps Rare 5,000, Epic 1,500, Legendary 400, Mythic 75. Art print edition
250 per champion.

## 8. Founder only decisions (never block on these, build sealed and ready)

- Confirm or adjust the chest prices, then set `COMMERCE_PRICES_CONFIRMED=true`.
- Real per card floor valuations before confirming (the guardrail forces floor at
  least price).
- Merch prices (checkout rejects merch until they exist).
- On chain mint: deployed contracts on Base and a platform voucher signer (the
  mint phase, deliberately last, never faked).
- The print on demand vendor contract and the payment provider account.

Everything else is yours to decide and build. Start at section 3, item 1.

## 9. Commands and map

- Gates: `npm run check:rules`, `npm run typecheck`, `npm test`, `npm run build`.
- Icons: `npm run icons` then `node scripts/normalize-icons-3d.mjs`.
- Strategy and reasoning: `docs/RAVENSPIRE-V2-STRATEGY.md`.
- Consolidated todo: `docs/RAVENSPIRE-V2.md` Part Three (sections 35 to 40).
- Design law: `docs/DESIGN-SYSTEM.md`. Rules: `AGENTS.md`.
- Commerce backend: `lib/commerce/**`, `app/api/commerce/**`,
  `app/api/chests/[sku]/open`, `app/api/reliquary/redeem`.
- Live database: Supabase project `tqvigouaifbklvajiyoj`. Migrations in
  `supabase/migrations/`.
