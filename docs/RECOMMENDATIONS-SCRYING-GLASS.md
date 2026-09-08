# Scrying Glass and the Swap: what's left

> This is a fresh assessment against the CURRENT build, not a verbatim copy
> of the original 50-point audit that kicked off this work (that list lived
> only in chat and was not saved to a file). The top 10 picked from it, plus
> the root-cause fix the live site's own bug report forced, are done and
> merged to `main`. This file is what's genuinely left, so the next pass has
> somewhere real to start rather than re-discovering the same ground.

## Shipped, do not re-propose these

1. Search (local board + wider-market fallback via `/api/token`).
2. Real chart timeframe zoom: 1H / 4H / 1D / 1W, each a genuine GeckoTerminal
   request (`app/api/coin/route.ts`'s `CHART_TIMEFRAMES`).
3. "The realm is trading": a real, live tape of verified on-chain trades
   (`components/trade/realm-trades.tsx`), polling every 15s with animated
   inserts.
4. "Houses trading this coin": real per-coin House social proof, joined off
   the verified trade feed and real House membership
   (`app/api/trade/house-activity/route.ts`).
5. Real buy/sell tax surfaced in the trade confirm panel, reusing the
   existing GoPlus scan (`components/trade/trade-panel.tsx`).
6. Real price-impact readout before confirm, derived from two live 0x quotes
   (a member's own trade and a small reference notional).
7. Configurable slippage tolerance (was hardcoded at 1%).
8. Server-synced coin watchlist: a real `public.watchlist_items` table, so a
   starred coin follows a member across devices, keyed by (chain, address)
   so two tokens on two chains sharing an address never collide.
9. "Turn this trade into a Call": the trade success screen opens straight
   into the new `/calls/new` page, pre-filled with the coin and a stance
   read from the trade.
10. Price/percent-move alerts on watched coins, evaluated session-driven
    (no paid cron tier exists, so this is a deliberate, honest tradeoff, see
    `app/api/watchlist/alerts/check/route.ts`'s own header comment) rather
    than a fake "real-time push" the platform cannot actually deliver.
11. The real bug behind low coin counts: ~49-84 simultaneous requests to
    GeckoTerminal's free, rate-limited API in one burst, most silently
    swallowed. Fixed with throttled, breadth-first waves
    (`app/api/scrying/route.ts`'s `runThrottled`/`buildJobs`).
12. A pass of real mobile/tablet layout bugs on this feature specifically
    (Console header truncating a short title on a phone, social icons
    crowding out market cap/volume text on a narrow row).

---

## What's actually left, grouped by where it lives

### The board itself (`app/(shell)/scrying/page.tsx`, `app/api/scrying/route.ts`)

1. **Portfolio-aware rows.** A member holding a coin already, seeing it on
   the board with no indication, is the one piece of "this is personal"
   context the board is missing. A small "You hold $X" chip on a row the
   member's own wallet already carries a balance in, read from the same
   `/api/wallet/balances` the Vault already calls.
2. **A real risk score, not three separate signals to reconcile.** Liquidity,
   pool age and the GoPlus scan all exist today but live in different
   places (the board row, the coin page's `RiskBanner`, `TokenSafety`). One
   composite badge (Low/Medium/High risk, computed server-side from all
   three, never invented) would read as one honest signal instead of three
   a member has to average themselves.
3. **Cross-chain comparison view.** The chain filter narrows to one chain;
   there's no way to see, say, three chains' top movers side by side without
   tab-switching. A compact 2-3 column compare mode reusing the existing row
   component.
4. **Whale-flagging on the live trade tape.** `RealmTrades` shows every
   verified trade the same size; a real, usd-value-sized trade already
   exists in principle (the feed route deliberately nulls amounts today for
   the reason documented in `realm-trades.tsx`'s own comment, so this
   depends on that decision being revisited first, not a quick add).
5. **A daily/session digest notification**: "3 coins on your watchlist moved
   more than 10% today" as a single rollup, distinct from the per-coin
   alert, for a member who wants a summary rather than a stream.
6. **Recently viewed coins**, a small local (or, once there's appetite, a
   server-synced) strip so a member bouncing between five coins mid-research
   doesn't lose the thread.
7. **A "why is this trending" one-liner per coin**, real-data-grounded (the
   same figures the coin page already reads: volume, liquidity, age, 24h
   move), written by the Herald on demand rather than precomputed for every
   row on the board (cost). Ties into the AI-pipeline work from the wider
   platform sweep, if that lands first, since it is the same model plumbing.

### The coin detail page (`app/(shell)/coin/[address]/page.tsx`, `app/api/coin/route.ts`)

8. **Holder distribution / top holders.** Explicitly called out today as
   "not cheaply available from the keyless market lens" (see the page's own
   "Holders and transaction history" empty-state copy). Still true; would
   need a paid indexer (Covalent/GoldRush is already integrated for The
   Watch and could plausibly cover this on its existing free tier, worth a
   real check before assuming a new cost).
9. **A per-member trade history on the coin page** (distinct from the
   realm-wide live tape): "your last 5 trades on this coin," pulled from the
   member's own verified rows in `public.trades`.
10. **Link a coin to the Calls already standing on it.** `lib/calls/similar.ts`
    already computes "Calls on this exact subject" for the Call composer's
    own preview panel; surfacing that same real count on the coin page
    itself ("4 open Calls on this coin") is mostly wiring, not new data.
11. **Gas/network-congestion read before confirm**, so a member on a
    congested chain sees a real estimate rather than discovering it only
    after the wallet prompt.
12. **A comparison against the member's own cost basis**, once they hold a
    position: "up 12% since you bought," computed from their own real
    trade rows, not an invented average.

### The Swap / trade panel (`components/trade/trade-panel.tsx`)

13. **Batch "sweep to native" for dust holdings.** A member with a dozen
    small positions has no way to convert them back to the chain's native
    token in one flow; today it's one swap at a time.
14. **Limit orders.** 0x's API does not do resting limit orders natively; this
    would need either a third-party limit-order protocol integration or an
    honestly-labeled "alert, then one-tap swap" approximation rather than a
    real on-chain limit order, which is a meaningfully different (and
    honest) scope than the phrase "limit order" usually implies. Flag this
    explicitly to whoever picks it up: do not silently ship a fake limit
    order.
15. **DCA / recurring buys.** Same shape of problem as limit orders: nothing
    non-custodial and keyless does real recurring execution without either
    a server holding a signing key (violates the non-custodial rule outright)
    or a smart-contract-based automation layer (Gelato Network, e.g., has a
    free tier), which is a real infrastructure decision, not a quick feature.
16. **Slippage auto-suggestion from real liquidity depth**, rather than three
    flat presets for every coin regardless of how thin its pool is.
17. **A post-trade share/success card**, the same "just did something real,
    worth showing" moment the tip flow already has
    (`components/tip/tip-success-card.tsx` is the existing pattern to reuse,
    not invent fresh). Genuinely belongs on the platform-sweep list too
    since it touches the Swap specifically; noted here so it isn't lost if
    that sweep prioritizes differently.

### Cutting across the whole feature

18. **A member-level trade/watchlist digest email or Telegram notice.** The
    realm already integrates Telegram bot infrastructure elsewhere
    (`.env.example`'s `TELEGRAM_BOT_TOKEN`); an opt-in real-time channel for
    price alerts would remove the "session-driven, not push" honest caveat
    item 10 above still carries, without needing a paid cron tier (a
    Telegram bot can push proactively; the gap today is server-side
    scheduling to trigger it at all, so this is a real, larger infra
    decision, not a small add).
19. **Advanced chart tooling** (moving averages, RSI, drawing) for the
    coin-page chart. A genuinely large scope on its own; sequence last.
20. **A TikTok-style swipeable mobile discovery mode** for the board, as an
    alternative to the list, explicitly optional and additive (the list
    view is the primary, accessible, keyboard-reachable surface per house
    rule 12; a swipe mode would need to meet the same bar, not replace the
    list).

---

## A caution for whoever picks this list up next

Two of the items above (13, 14, 18) brush against "an automated system moves
a member's funds," which is exactly the line rule 6 (non-custodial only)
exists to hold. A recurring buy or a limit order that works by having a
server hold a key, or by pre-signing a blank check of a transaction, is not
a smaller version of the real thing, it is a different, custodial thing
wearing the same name. Any of these that gets built has to keep signing on
the member's own device at execution time, or use a real non-custodial
automation layer (a smart-contract-based executor the member's wallet
authorizes with a scoped, revocable permission, never a private key handed
to the platform). If that constraint makes an item too large for a single
pass, say so plainly rather than shipping a custodial shortcut quietly.
