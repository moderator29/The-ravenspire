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
   (live), Whispers (DMs), The Vault (wallet), The Coffers (a member's earnings),
   The Exchequer (the platform's own fee wallet, never called the Coffers), The Ledger
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
   POINTS somewhere to go. Crafting is DONE and sealed behind `crafting_live`:
   4 rare make an epic, 4 epic a legendary, 10 legendary a mythic, every ratio
   asserted at module load to destroy floor value and to be no cheaper than the
   chest that sells the rarity. `RAVENSPIRE-V2.md` section 44. The rest of the
   item is untouched.
4. **Native secondary market.** The Bazaar is DONE and sealed behind
   `market_live`: list, reserve, buy, withdraw, with a 5% protocol fee to the
   Exchequer shown in full before anybody signs. A listing is an intent, never a
   deposit: the card stays the seller's until the moment it becomes the
   buyer's, and the payment goes wallet to wallet in transactions the buyer
   signs, so the platform never holds either side. `RAVENSPIRE-V2.md` section
   45 carries the custody argument in full. Gifting and a payment-free transfer
   are the two pieces still absent.
5. **Appointment mechanics and seasons.** DONE. `RAVENSPIRE-V2.md` section 46.
   The Muster (two two-hour windows a day, paid out of the social allowance
   that already exists so it mints nothing, earning `lord-of-light` at a thirty
   day vigil), a weekly Clash on the calendar with an idempotent settlement and
   a frozen result, and a season close that banks rank, resets Glory alone and
   crowns `champion-of-the-season`. One hourly cron, `/api/cron/clock`. The
   daily Warchest window this item originally asked for is NOT available and
   should not be built: chests cost money and are sealed, so a window handing
   them out would be inventing a reward the realm cannot pay.
6. **Provably fair as a feature.** DONE. `RAVENSPIRE-V2.md` section 47. A public
   verifier at `/proof`, outside the shell so a stranger with no account can check
   a draw, plus the reveal affordance on the Ceremony. The roll runs in the
   member's own browser rather than on the realm's server, because a server that
   would fake a draw would also return "verified" for it, and the published
   references let anybody audit an opening they had nothing to do with.
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
12. **Compliance guardrails** before commerce takes a dollar. DONE.
    `RAVENSPIRE-V2.md` section 48. The Alms (a real Squire's Chest, given free, same odds and same floor and same
    proof), a server recorded age gate that stores no date of birth, spend caps
    of 250 a day and 1,000 a month computed from real orders, a velocity brake,
    an informed consent interruption, a member set cap that lowers at once and
    raises only after a day, and geo. All of it decided inside
    `public.commerce_checkout_guard` in the same transaction that creates the
    order, because a cap enforced a round trip later is not a cap. Migration
    Applied in four parts,
    `20260813164228` through `20260813164429`, advisor clean.
    Read section 48.6 before believing anything about geo: reliable
    geolocation needs a paid service the realm does not have, and what is built
    is the seam plus the one free signal, honestly labelled.

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

Detail in `RAVENSPIRE-V2.md` section 39. Highest value first:

1. Move chest claim, roll and grant into one transactional RPC, or reset
   `opened_at` on failure, so a database error mid open never burns a paid chest.
   DONE. `public.chest_open`, one transaction under a row lock.
2. A server side daily War Glory cap (mirroring the two hundred per day social cap),
   or seed based replay verification, since War Glory is self reported. DONE.
   1,500 a day on its own allowance, `public.award_capped`.
3. On chain verification of the `tx_hash` on tips and trades before recording.
   DONE. `lib/chain/verify-transfer.ts`, free tier over the existing Alchemy
   key. An unproven transfer is recorded but kept out of the shared feed and
   rings nobody, because what is defended is the audience, not the record.
4. Pre commit a rotating seed for chest opening (stronger provably fair). DONE,
   both halves: `RAVENSPIRE-V2.md` section 42.1.
5. Align the redeem route comment with its code (the `attempts` bump).
6. Seasonal quest verification. FIXED. `lib/game/quest-verify.ts` read
   `started_at` from `seasons` and the column is `starts_at`, so a swallowed
   PostgREST error meant every seasonal quest had silently been verified
   against a rolling ninety day window instead of against the season.

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
confirmed. One print on demand vendor, Gelato, with Printful and Prodigi
fallbacks behind a swappable abstraction. Per card mint caps Rare 5,000, Epic
1,500, Legendary 400, Mythic 75. Art print edition 250 per champion.

**Prices, final, set by the founder.** These supersede the 4.99 / 14.99 / 59.99
placeholders this section used to carry.

| Chest | Price | Guaranteed floor |
| --- | --- | --- |
| Squire's Chest | 34.99 | 38 |
| Knight's Warchest | 41.00 | 92 |
| King's Reliquary | 54.86 | 192 |

Per rarity guaranteed floor: Rare 8, Epic 22, Legendary 60, Mythic 275. This is
the value the PLATFORM commits to standing behind, not a market price, not an
appraisal, and not a promise about what anyone else will pay. Nothing may render
it as one, and the secondary market must never quote it.

The chest floors are not typed in as three magic numbers: the module derives
the worst a chest can open from the per rarity floor, its card count and its
printed guarantee, and refuses to load if a digital chest's promised floor and
its dealt floor stop matching. Both digital floors fall out exactly (two rares
and an epic is 38, four rares and a legendary is 92). The King's Reliquary sits
above its card floor because it also ships merch and a print.

Merch, final: Obsidian Tee 32, Rookery Hoodie 68, Banner Cap 30, Set One Art
Print 42 (numbered giclee, edition 250), War Playmat 48. The merch line is live
in checkout and answers to `mercer_live`, separately from `chests_live`.

`COMMERCE_PRICES_CONFIRMED` is still off, and deliberately so: it waits on the
checkout frontend, a real payment account, and the compliance guardrails. A
number being decided and a realm being ready to take money are two different
facts.

## 7b. Two founder calls made this session, and where they landed

**POINTS convert to $RSP at TGE. Committed.** An earlier pass removed that line
from the earnings surfaces on the reading that it was a promise the product had
never made. The founder confirms it was, so it is back, in The Coffers and on the
Keep's earnings panel, and the Herald may state it in conversation.

What is NOT committed is a rate, and every surface says so in the same breath.
Those are two different claims: the conversion is a fact about the future, a rate
would be a valuation today. Rule 7 is unchanged and unaffected, because it is
about display rather than about whether a conversion exists: an earned balance is
rendered as POINTS and never as an amount of $RSP, before and after this.

**The pitch is "Make the call. Earn your name."** In full: *a competitive realm
of Houses, Calls, Crests and Renown, where standing is earned through
participation.*

`RAVENSPIRE-V2.md` line 113 recorded this as defect P10, "positioning
contradicts itself three ways on one page load", and it was still true: the
Open Graph block pitched a competitive realm, the Twitter block pitched a safety
scanner ("See every chain. Fear no rug."), the web manifest pitched a fun-first
social realm, and the Herald's own brief led with the collection. A stranger met
whichever their client happened to read.

All four now say the founder's line, and the Herald's identity paragraph leads
with it and keeps the collection as the largest thing a member builds rather than
as the identity itself. "SocialFi" stays retired.

## 8. Founder only decisions (never block on these, build sealed and ready)

- The final yes to set `COMMERCE_PRICES_CONFIRMED=true` and flip `chests_live`.
  Prices, floors and merch prices are all decided and encoded, the checkout
  frontend is built (section 43), and the compliance guardrails are built
  (section 48). What remains is a real Stripe account and
  reading section 48's "what
  this does not cover" paragraphs with somebody qualified to say what is
  missing. Nobody who built the guardrails is a lawyer and none of them claims
  compliance with any law.
- Whether to buy an IP intelligence provider. Section 47.6 sets out what geo
  can and cannot establish for nothing, and names the seam a paid provider
  plugs into. Not buying one is a legitimate choice; believing the free signal
  is stronger than it is, is not.
- `COMMERCE_GEO_MODE` and `COMMERCE_BLOCKED_COUNTRIES`. Both unset, and
  deliberately: a list of countries hardcoded in a source file is a legal
  position taken by a developer.
- The mobile dock: five slots, section 29 offers two arrangements and
  recommends the one carrying the Reliquary. Its prerequisite, a top bar
  search, now exists. One array in `lib/nav.ts` when you decide.
- On chain mint: two deployed contracts on Base and the platform voucher signer.
  The interface the contracts must implement is recorded in
  `lib/chain/claim-abi.ts` and cannot be edited apart from the voucher, since a
  struct that differs by one field produces a signature that verifies against
  nothing and the member meets that failure in their own wallet after paying
  gas. Deliberately last, never faked.
- The Gelato and Stripe accounts. Keys go in env, never in a commit.

Everything else is yours to decide and build. Start at section 3, item 1.

## 9. Commands and map

- Gates: `npm run check:rules`, `npm run typecheck`, `npm test`, `npm run build`.
- Icons: `npm run icons` then `node scripts/normalize-icons-3d.mjs`.
- Strategy and reasoning: `docs/RAVENSPIRE-V2-STRATEGY.md`.
- Consolidated todo: `docs/RAVENSPIRE-V2.md` Part Three (sections 35 to 40).
- Design law: `docs/DESIGN-SYSTEM.md`. Rules: `AGENTS.md`.
- Commerce backend: `lib/commerce/**`, `app/api/commerce/**`,
  `app/api/chests/[sku]/open`, `app/api/reliquary/redeem`.
- Collectibles sinks: `lib/collectibles/crafting.ts` (the rule, and the two
  assertions that make it a sink), `app/api/collectibles/craft`,
  `components/collectibles/crafting-bench.tsx`.
- The secondary market: `lib/commerce/market.ts` (the rule, the fee, and the
  custody argument), `lib/commerce/market-config.ts`, `app/api/market/**`,
  `components/market/**`.
- The compliance guardrails: `lib/commerce/compliance.ts` (every threshold,
  every justification, and a "what this does not cover" paragraph per
  guardrail), `lib/commerce/geo.ts` (the honest limits and the paid-provider
  seam), `supabase/migrations/20260813164228_compliance_guardrails_tables.sql` and the
  three parts after it (every
  decision, since a cap enforced outside the transaction that creates the order
  is not a cap), `app/api/commerce/{checkout,alms,compliance}`,
  `components/commerce/{alms-panel,guard-interruption,spend-limits-panel}.tsx`.
- Live database: Supabase project `tqvigouaifbklvajiyoj`. Migrations in
  `supabase/migrations/`.
