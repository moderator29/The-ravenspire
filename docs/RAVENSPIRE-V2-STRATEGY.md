# Ravenspire Strategy: the co-founder read

This is the deep read a second co-founder owes the first: where the ecosystem
actually is in mid 2026, where Ravenspire genuinely wins, where it will stall if
we do nothing, and the specific moves that take it to the next level. It ends in
a prioritized todo split two ways: recommendations that came out of research,
and recommendations that came out of looking hard at what we already built.

Everything here obeys the house rules in AGENTS.md. Real data only. Real AI
only. Non custodial only. Server authoritative rewards. No invented scarcity.
The strategy does not ask us to break a single one of them, because the rules
are the product's credibility and credibility is the moat.

## 1. Where the ecosystem actually is (mid 2026, grounded)

Four currents matter to us, and all four point the same way.

**SocialFi is being killed by extraction, not by lack of interest.** Points and
airdrop programs moved billions to users, and the result was mercenary: farmers
arrive for the reward, Sybil the system with many accounts, and leave the day
the emission stops. The 2026 meta is the opposite of easy points: quality
engagement, Sybil resistance, and reasons to stay that are not the airdrop. AI
native apps monetize the first session well and then bleed loyalty. The lesson
for us is blunt. A points balance is table stakes and, on its own, a churn
machine. What retains is identity, status, and things a user cannot take with
them to the next app.

**Phygital collectibles are the one corner of the NFT world that is growing.**
The hybrid physical plus digital market is measured in the billions and rising,
transactions up sharply year over year, while pure speculative NFTs are a
graveyard (the widely cited figure is that ninety six percent of older projects
are dead). What survives has real world utility: a digital item that redeems for
a physical object, authenticity you can verify with an NFC tag or a code, low
print editions that hold a premium precisely because the scarcity is real and
the provenance is on chain. This is exactly the King's Reliquary pattern we
already designed: a physical box, printed cards, and a single use code that mints
the digital twins to the member's own wallet.

**Mystery boxes are walking into real regulation.** The direction across Western
markets is stricter, and the EU Digital Fairness Act expected through 2026 is the
one to design for now, not later. The likely requirements: exact per item odds
disclosed on every box, spending caps and cooling off periods, an age gate,
clear pricing, and an alternative means of entry so the mechanic is a purchase
with a free path rather than a wager. Provably fair architecture (a cryptographic
commitment so a buyer can verify the draw was not altered after the fact) is now
the credibility baseline, with one caveat worth internalizing: provably fair
proves the draw was honest, it does not prove the prize table is generous. We
must publish both the verifier and the value math.

**Wallets went invisible.** The 2026 embedded wallet standard is account
abstraction: gasless transactions paid by a paymaster, gas payable in stablecoins,
social login, social recovery, and spending limits, so a non custodial wallet
finally forgives mistakes the way a custodial one did. Privy, which we already
use, is named among the leaders. The strategic point is that non custodial is no
longer a UX tax we apologize for. Done with account abstraction it is a feature:
your keys, your cards, no gas anxiety, no seed phrase, recoverable.

The synthesis: we are, almost by accident, pointed at the three things that are
working (phygital utility, invisible non custodial wallets, credible provably
fair mechanics) and away from the one that is dying (extractive points only
SocialFi). The job is to lean all the way into that and to not fumble the
compliance and the money safety on the way.

## 2. Ravenspire's real position: unfair advantages and structural gaps

### The unfair advantages, said plainly
- **A world, not a feed.** The realm lexicon, the Houses, the Calls, the War, the
  Herald: this is an identity and status system, which is the exact thing that
  retains when points do not. Most SocialFi is a leaderboard with a token bolted
  on. We have lore that means belonging.
- **Non custodial by construction.** We never hold keys or funds. In a market
  that just watched custodial actors implode repeatedly, "we cannot lose your
  money because we never touch it" is a trust wedge, not a limitation.
- **The collectibles bridge.** The card game gives the collectibles intrinsic
  meaning (a card is a champion you play, not a jpeg), and the phygital box gives
  the digital a physical anchor. That two way tie is the thing pure NFT drops
  never had.
- **Server authoritative and honest.** Points and Glory settle on the server
  against verified events, and the codebase already had its worst money exploit
  found and closed. That discipline is rare and it is bankable.

### The structural gaps, said just as plainly
- **The loop is not closed.** We mint status (Renown, Glory, Crests, POINTS) but a
  member cannot yet spend it on anything that matters, cannot trade a card, cannot
  feel scarcity, cannot lose or win something at stake beyond a number. Status
  with no sink and no market is a number that inflates and stops mattering.
- **No secondary market, no ownership economy.** A collectible I cannot trade,
  gift, or display as mine is a sticker, not a collectible. The resale premium is
  the whole reason phygital retains, and we have no floor, no listing, no transfer.
- **Retention rests on novelty.** Today the reasons to come back tomorrow are
  content and streak, both fragile. There is no appointment, no expiring
  opportunity, no social obligation pulling a member back at a set time.
- **The money surfaces are the least battle tested.** Commerce, chest opening,
  redemption, and any future mint are exactly where a bug costs a user real value,
  and they are the newest, thinnest code. This is the highest leverage place to be
  paranoid.
- **Compliance is unbuilt.** Odds disclosure we have. Age gate, spending caps,
  cooling off, alternative means of entry, geo awareness, and the provably fair
  verifier are not built, and mystery boxes without them are a legal liability the
  day we take a dollar.

## 3. The retention engine we are missing (the core move)

Retention is not one feature, it is a loop with four beats, and we have beat one
and half of beat two. The loop that keeps a collectibles community alive:

1. **Earn** status and currency from real activity (we have this: POINTS, Glory,
   Renown, Calls, Crests).
2. **Own** something scarce and yours (partial: cards exist as a set, but sealed,
   untradeable, no wallet backed ownership yet).
3. **Spend and stake** that status and currency on outcomes that matter (missing:
   no sink, no market, no wager with real stakes).
4. **Show** what you own and have won, to people whose opinion you care about
   (partial: profiles and Houses exist, no trophy case, no display of holdings,
   no rarity flex).

The single highest leverage program in the whole platform is closing beats 3 and
4. Concretely: a card you truly own in your own wallet, a House trophy case and
personal Vault display that shows your rarest holdings and won Crests, a sink
where Glory or POINTS buys crafting or entries rather than only accumulating, and
Calls that can be entered with something at stake so a win is felt. None of this
requires a token sale or custody. All of it deepens the exact loops we already
built.

## 4. The strategic moves that take us to the next level

Each move states the idea, why it matters now, how it blends with what exists,
and the ecosystem pull (the "yes, we fuck with this" reaction).

### Move 1: Close the ownership loop. Real, wallet backed, tradeable cards.
The card a member pulls should be theirs, in their Privy wallet, non custodial,
and eventually transferable. Start with the digital twin as an owned item and a
House bound "soulbound" tier for earned Crests that should never be sold. Blend:
the Reliquary becomes a real collection, the Keep shows owned rarities, the War
plays cards the member actually owns. Pull: collectors only respect what they can
hold and move. This is the difference between a sticker album and a market.

### Move 2: A native secondary market, non custodial and honest.
A place to list, buy, gift, and transfer cards, member to member, signed by their
own wallets, with a small protocol fee that funds the Coffers rather than a
middleman. Print run caps make a floor real. Blend: The Scrying Glass already
does discovery, extend the muscle to card discovery and floors. Pull: a resale
premium is the documented reason phygital retains; low print editions command
large premiums precisely because holders can sell. No market, no premium, no
reason to chase rarity.

### Move 3: Sinks and stakes, so status is spent, not just hoarded.
Glory and POINTS need somewhere to go. Crafting (combine duplicates into a higher
rarity), Call entries with a stake, House treasury contributions that buy House
level perks, cosmetic Crest frames. Blend: this is the missing beat 3, wired into
Calls, Houses, and the Forge moments we already reserve for earned ceremony.
Pull: an economy with a sink holds value, an economy that only mints inflates to
zero. This is also our honest answer to "what is the token for" without a token
sale: utility first, on platform, non custodial.

### Move 4: Appointment mechanics and seasons.
A daily reason at a set time and a season that ends. Daily Warchest drop window,
a weekly House Clash with a settlement time, a season with a finale and a reset
that banks your rank into a permanent badge. Blend: the Chronicle already writes
daily, Houses already Clash, Calls already settle. Give them a clock and a season
arc. Pull: retention is a habit, and habits need appointments. "The Clash settles
Friday at eight" brings people back the way a raid night does.

### Move 5: Provably fair as a marketed feature, not a footnote.
Ship the chest opening with a public commit reveal seed and a working verifier
page, and publish the value math (the guaranteed floor and expected value per
box) beside the odds. Blend: the Ceremony is the reveal, add the "verify this
pull" affordance right on it. Pull: in a market that just learned to distrust
random draws, the operator who hands you the math and the verifier is the one
people trust with money. It is also most of the compliance posture for free.

### Move 6: Authenticity you can scan (the phygital tie).
Every physical King's Reliquary box carries an NFC tag or QR that proves the box
is genuine and links its printed cards to their digital twins. Blend: the
redemption code already mints twins, make the physical also verify. Pull: NFC and
QR authenticity is now standard for credible phygital, and it is what lets a
resold physical card carry its provenance. It also kills counterfeits before they
start.

### Move 7: The Herald as the retention brain, not just a chat.
The Herald already reads a Call before it seals and writes the Chronicle. Point it
at retention: a personal weekly brief ("your House is third, one Clash win takes
second, your rarest card's floor moved"), surfaced as a notification, grounded in
real data, never invented. Blend: it is the same real AI over real data we
already committed to, aimed at the one job AI apps fail, which is loyalty. Pull:
an assistant that tells you the one thing worth coming back for is the difference
between a tool and a habit.

### Move 8: Creator and House economies.
Let Houses and top members earn: a House treasury that accrues a slice of market
fees from its members' trades, Renown that unlocks the ability to issue House
Calls others follow. Blend: Houses and Renown exist, give them an income and a
lever. Pull: SocialFi that lasted (the friend.tech lineage) paid the people who
brought the audience. Aligning House leaders' incentives with the platform's is
how a community runs itself.

### Move 9: Distribution wedges native to the realm.
Shareable, real artifacts: a Call result card, a pull reveal, a season finale
rank, each a portrait worth posting, each carrying an invite. Blend: we already
render opengraph images for profiles and champions, extend to Calls and pulls.
Pull: the cheapest, most credible acquisition is a member showing off a real win,
not an ad. This is zero budget growth, which fits rule 19.

### Move 10: Gasless, forgiving non custodial UX.
Adopt account abstraction on top of Privy: a paymaster so pulls and claims are
gasless, gas payable in stablecoin where not, social recovery, and a spending
cap the member sets. Blend: Privy is already the signer, this is the 2026 upgrade
path it supports. Pull: non custodial stops being the thing we apologize for and
becomes "your keys, no gas, recoverable," which is the exact objection that keeps
mainstream users out of self custody.

## 5. Frontend upgrades across the platform

Grounded in the design system (two registers, six archetypes, one card chassis).
The theme: the Ledger register is right and should get denser and faster, the
Forge register should be reserved harder and hit harder when it fires.

- **A real ownership surface.** The Keep and the Vault need a trophy case: owned
  cards by rarity, won Crests, House standing, rarest holding, all real or an
  honest empty state. This is the "Show" beat and it barely exists.
- **The card chassis, everywhere it belongs.** One card component that renders a
  champion at every size (feed, Reliquary grid, detail sheet, War hand, share
  image) so a card looks like the same object across the app. Rarity is expressed
  in the frame, never a caption.
- **The Ceremony as the one true Forge moment.** Pack opening is where gold, glow,
  3D, and heavy motion are earned. It should be the most crafted screen we have,
  and the verify affordance lives on it.
- **Density and speed pass, continued.** The Ledger surfaces (Ravenry, Ledger,
  Scrying, Vault) should keep getting more compact and sharper on desktop, with
  genuinely different mobile layouts, not scaled ones.
- **Notifications and appointments UI.** A surface for the daily window, the Clash
  clock, floor moves, House standing. This is the habit layer and it has no home
  yet.
- **The cx primitive fix, with a visual pass.** The documented override precedence
  defect means caller overrides on Button and Card are silently dead. Fixing it is
  correct and has a wide blast radius, so it is a deliberate visual pass, not a
  drive by. (Assigned to the build agent.)
- **Onboarding as a first Forge moment.** Choosing a House, claiming a handle, the
  first card: onboarding should feel like induction into a world, and it is
  currently the thinnest surface we have.

## 6. Money gap vulnerabilities and the security posture

This is where a bug costs a user real value, so the posture is paranoia by
default. The classes to hunt and fix (the security agent owns the code level
audit and fixes; this is the map):

- **Server authority on every value mutation.** Points, Glory, order price, chest
  odds, quantities: never trusted from the client, always recomputed server side
  from a server catalog and verified events. One trusted client number is one
  exploit.
- **RLS deny by default, ownership in the route.** Privy makes auth.uid() null, so
  every route that touches a user owned row must check ownership via the service
  role. The prior exploit (SECURITY DEFINER functions callable by anon) is the
  template for what to keep hunting.
- **Idempotency and no double spend.** Every credit and debit, every chest open,
  every webhook, needs an idempotency key and a race safe path, or a user double
  opens a chest or a forged webhook credits an order.
- **Provably fair, tamper evident draws.** The chest seed is server committed and
  revealed, the mapping from number to prize is published, the floor is enforced
  server side. No client influence on the outcome.
- **Non custodial value transfer, no key exposure.** Every transfer is signed by
  the member's own wallet. No signer private key in the bundle or the server logs.
  Vouchers are bound to the recipient and the chain id and are replay proof.
- **Money as integers.** Prices and balances in minor units, never floats, or
  rounding steals fractions at scale.
- **Webhook and signature verification.** Stripe and Privy webhooks verified and
  idempotent, so a forged event cannot credit an order or a balance.
- **Secrets on the server only.** Service role key, Anthropic key, any signer key,
  any payment secret: never imported into a client component, never shipped in the
  bundle.
- **Abuse and Sybil resistance on rewards.** Durable rate limiting (the in memory
  limiter is not enough), anti automation on anything that mints value, so a
  scripted farm cannot drain emissions.
- **SSRF and injection on external lookups.** Token lookups hit CoinGecko,
  GeckoTerminal, DexScreener: allowlist and validate, so a crafted input cannot
  turn our server into a proxy.

## 7. Compliance guardrails (build these before we take a dollar)

Non negotiable for Warchests and the Mercer, drawn from where regulation is
heading in 2026:

- **Per item odds on every box**, which we have, kept honest by the load time sum
  check we already wrote.
- **Guaranteed floor value and published expected value per box**, so the mechanic
  is shopping with a known minimum, not a wager with a hidden edge.
- **Alternative means of entry**, a free path to the same rewards, which is the
  single most important line between a mystery box and gambling in most Western law.
- **Age gate to eighteen plus**, spending caps, and a cooling off affordance.
- **Geo awareness**, so boxes are not offered where they are prohibited.
- **A working provably fair verifier page**, public, that a buyer can run against
  their own pull.
- **No invented scarcity**, ever: the print caps are real, published before mint,
  and enforced.

Skipping these is not a shortcut, it is the one mistake that can end the platform
rather than cost a deploy.

## 8. Why this is inspiring and promising (the wedge, in one paragraph)

The pitch that makes a stranger lean in: Ravenspire is a world you earn your way
into, where the status you build is a collection you truly own, the cards you
pull are champions you actually play, the rarest of them arrive in a real box you
can hold and verify, and the platform never once touches your money or your keys.
It is the collectibles community that pure NFT drops failed to be, because the
collectible means something (you play it, you wear it, you display it) and the
trust is structural (non custodial, server honest, provably fair, real data
only). We are aimed at the three things working in the market and away from the
one that is dying, and the moat is the thing that is hardest to fake: a community
with lore, ownership, and honesty, compounding.

## 9. The prioritized todo

Split as requested: what research says we should add, and what our own features
say we should upgrade and why. Ordering inside each is by leverage. This list is
consolidated into RAVENSPIRE-V2.md at integration, together with the two agents'
build output and security findings.

### A. Recommendations from research (new, ecosystem driven)

1. **Close the ownership loop**: wallet backed, non custodial, eventually
   tradeable cards, with a soulbound tier for earned Crests. Highest leverage.
2. **Native secondary market**: list, buy, gift, transfer, member to member,
   signed by their own wallets, protocol fee to the Coffers, real print caps for a
   real floor.
3. **Sinks and stakes**: crafting duplicates up a rarity, Call entries with a
   stake, House treasury perks, cosmetic Crest frames. Give status somewhere to go.
4. **Appointment mechanics and seasons**: daily drop window, weekly House Clash
   clock, season finale and rank to permanent badge.
5. **Provably fair as a feature**: public commit reveal seed, working verifier
   page, published floor and expected value on the box and the Ceremony.
6. **Phygital authenticity**: NFC or QR on the physical box, tying printed cards to
   their digital twins and carrying provenance on resale.
7. **The Herald as retention brain**: a personal weekly brief grounded in real
   data, surfaced as a notification.
8. **Creator and House economies**: House treasuries that accrue a slice of market
   fees, Renown that unlocks issuing Calls.
9. **Native distribution wedges**: shareable real artifacts (Call result, pull
   reveal, season rank) each carrying an invite.
10. **Gasless, forgiving non custodial UX**: account abstraction on Privy,
    paymaster gasless pulls and claims, social recovery, member set spending caps.
11. **Compliance guardrails**: AMOE, age gate, spending caps, cooling off, geo
    awareness, the verifier page. Before we take a dollar.

### B. Recommendations from current platform features (upgrade, and why)

1. **The loop is open, so close it.** We mint Renown, Glory, Crests, POINTS with no
   sink and no market. Add spend and trade, or the numbers inflate and stop
   mattering. (Feeds moves 1, 2, 3.)
2. **Cards are sealed with no ownership, so make them owned.** The Reliquary shows a
   set nobody can hold. Wallet backed ownership turns a preview into a collection.
3. **The Keep and Vault do not show what you own or won, so build the trophy case.**
   The "Show" beat is the cheapest retention we are leaving on the table.
4. **Calls settle but carry nothing at stake, so let members stake.** A prediction
   with something on it is felt, and it wires the sink into a surface we built.
5. **Houses Clash but on no clock, so give the Clash a season and a settlement
   time.** Appointments are how a community forms a habit.
6. **The Herald reads Calls but does not chase retention, so aim it there.** Same
   real AI over real data, pointed at loyalty instead of only insight.
7. **The Ceremony is our one Forge moment, so make it the best screen we have** and
   put the provably fair verifier on it.
8. **The rate limiter is in memory, so make it durable**, and put all four gates in
   CI. Cheap, and it unblocks trusting everything else. (Assigned to build agent.)
9. **The cx override defect makes primitive overrides dead, so fix it with a visual
   pass.** The primitive layer's central promise is currently false. (Assigned.)
10. **Money surfaces are newest and thinnest, so audit them hardest.** Commerce,
    chest, redemption, voucher: paranoia by default. (Assigned to security agent.)

### C. Item 7 decisions delivered (chest tiers, pricing intent, vendor, supply)

- **Tiers** (names confirmed by founder): Squire's Chest (digital, 3 cards),
  Knight's Warchest (digital, 5 cards), King's Reliquary (physical box: merch, 10
  printed cards, single use mint code). Odds already validated in
  lib/collectibles/warchests.ts and unchanged.
- **Pricing** (set by founder, stored server side, off customer surfaces until
  confirmed, guardrail: guaranteed floor value at or above price): Squire's 34.99,
  Knight's 41.00, King's Reliquary 54.86, all USD.
- **Vendor intent**: one print on demand vendor, Gelato (apparel plus fine art
  prints plus global fulfillment, Stripe compatible, no fixed cost), with Printful
  as apparel fallback and Prodigi for numbered giclee prints. Built behind a
  fulfillment vendor abstraction so the choice is swappable.
- **Supply per rarity intent** (per card mint caps, published before mint, real
  scarcity): Rare 5,000, Epic 1,500, Legendary 400, Mythic 75 per card. Set One Art
  Print numbered to 250 per champion. Commons are base and not in packs.

These are co-founder recommendations for founder sign off. They are stored server
side as a configurable catalog and never rendered on a customer surface until the
founder confirms and the feature flag flips, which keeps us inside the real data
only rule.
