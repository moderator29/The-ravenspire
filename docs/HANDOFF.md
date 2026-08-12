# The Ravenspire: handoff

The state of the realm, honestly, and what to build next. Read `AGENTS.md`
first (the house rules are compulsory), then `docs/DESIGN-SYSTEM.md` before
designing any surface. The full V2 plan is `docs/RAVENSPIRE-V2.md`;
`docs/NEXT-SESSION-HANDOFF.md` is an older session's notes and is history now,
not instruction.

## 1. How this work runs

Autonomous. Decide, build, verify, commit, push, keep going. Do not stop to
ask permission for anything on the list in section 4. The founder-only calls
in section 5 are the exceptions, and they are never a reason to stop: build
the work sealed and ready so a single yes ships it.

Every push passes all four gates, and none of them may go red:

```
npm run check:rules   # the house rules, mechanically
npm run typecheck
npm test
npm run build
```

After any DDL, run the Supabase security advisor against project
`tqvigouaifbklvajiyoj` and read what it says.

**Check the repository and the live database agree before writing a
migration.** They have diverged once already: the commerce engine migration
was applied to production by a session whose branch never reached `main`, so
five tables existed that no file described. It is recovered now, verbatim, as
`supabase/migrations/20260812224950_commerce_engine.sql`. `list_migrations`
against the project takes ten seconds and would have caught it.

## 2. What is live

The core platform: Ravenry, Calls, Houses, Crests and Renown, the War,
Whispers, the Rookery, the Vault, the Ledger, the Scrying Glass, the Swap,
the Watch, the Scanner, @raven, notifications, leaderboards, search, seasons.
Real data throughout, real Anthropic calls on every AI surface, non-custodial
throughout.

## 3. The collectibles realm

Sealed preview. Backend live, frontend sealed, so opening day is a flag flip
and not a deploy (`docs/RAVENSPIRE-V2.md` section 27).

| Piece | State |
| --- | --- |
| Catalog: Set One, forty cards derived from the champion roster | Shipped, in code, `lib/collectibles/set-one.ts` |
| Sealed chapters: Reliquary, Warchests, Mercer | Shipped, behind `LockedGate` |
| Interest capture ("Notify me") | Live, real, `/api/interest` |
| Commerce engine: orders, payments, fulfillments, chest entitlements, inventory | Schema live, sealed |
| The ownership loop: claims, vouchers, on-chain verification | Shipped, sealed. Section 35 of the V2 doc |
| The Hoard: the trophy case on the Keep, a public Keep and the Vault | Shipped. Honestly empty until a chest opens |
| Chest opening: pre-committed seed, deterministic roll, one atomic settle | Shipped, sealed. Section 36 |
| Realm flags | `reliquary_live`, `chests_live`, `mercer_live`, `mint_live`, all off |

## 4. The missions, in order

1. **Close the ownership loop.** Done. Wallet-backed non-custodial cards and
   soulbound crests: `docs/RAVENSPIRE-V2.md` section 35.
2. **The trophy case.** Done. The Hoard renders on the Keep, on a public
   Keep and in the Vault, with a server-side privacy gate.
3. **Sinks and stakes.** Crafting, staked Calls, House treasury perks.
4. **The native non-custodial secondary market.** Reads `isSoulbound`; a
   crest is never listable.
5. **Appointments and seasons.** Daily drop window, weekly Clash clock,
   season finale.
6. **Provably fair as a feature.** Verifier page, Ceremony reveal,
   pre-committed seed.
7. **Phygital.** NFC and QR authenticity on physical Warchests.
8. **The Herald as retention brain.**
9. **Creator and House economies.**
10. **Shareable distribution artifacts.**
11. **Gasless account abstraction on Privy.**
12. **Compliance guardrails** before commerce takes a dollar: AMOE, age gate,
    caps, cooling off, geo.

Alongside those, the leftover commerce build: checkout, the Ceremony and
redeem surfaces, redemption code creation, the fulfillment worker, refunds,
Sentry, onboarding, Whispers realtime, attachments.

The four security residuals are all closed: on-chain transaction verification
(section 35), the transactional chest open and the pre-committed seed
(section 36), and the daily War Glory cap (`award_capped`, and the reasoning
is in `lib/points.ts`).

What the chest opening still waits on is the thing that grants an
entitlement. Nothing sells a chest yet, so `chest_entitlements` is empty and
the opening route answers honestly that you have no unopened chest. Checkout
and redemption codes are the two writers, and both are founder-gated on
pricing.

## 5. Founder-only, and never a reason to stop

Build it sealed and ready; one yes ships it.

- Chest prices, then `COMMERCE_PRICES_CONFIRMED`.
- Real per-card floor valuations.
- Merch prices.
- The on-chain mint: the two contracts and the voucher signing key. The
  interface the contracts must implement is recorded in
  `lib/chain/claim-abi.ts` and cannot be edited apart from the voucher.
- Vendor and payment accounts.
