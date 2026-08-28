# Ravenspire Finalization Board

The shared execution board for the final all-hands sprint. Three agents plus the
lead integrator work from this file. House rules apply here too: no em dashes,
no emoji. Finding numbers refer to the finalization audit run at the start of
this sprint (Agent 1), which itself verified the historical findings in
docs/RAVENSPIRE-V2.md sections 3 and 39.

Priority order for the sprint, do not reverse it:
1. Broken functionality
2. Incomplete core features
3. Frontend/backend integration problems
4. Security and reliability
5. Major UX problems
6. Dead code and technical cleanup
7. Visual polish
8. High-value quick features
9. FUTURE (do not touch)

## Audit verdicts on the historical findings

All seven criticals (C1 to C7) from the V2 audit are fixed and verified in
code, as are B1, B2, B4, B6, B8 and five of the six section 39 residuals.
Still live at sprint start: B3 (windowed hit rate), B5 (referral exact
equality), B7 (notifyFollowers loop), B9 remainder (two orphan files), 39.6
(client-set wallet_address, accepted set-once residual).

## NOW (currently being built)

Nothing. The re-audit fix wave is complete and pushed to main.

## DONE (verified complete)

- Both sessions merged to main: 17 conflicts resolved keeping the union of
  protections and the stricter of any two limits; the /reliquary route the
  other branch lost was restored; all gates green on the merge.
- Re-audit fix wave (all P0 to P3 findings): the war settle no longer
  fabricates success when the capped RPC is unapplied (fallback settle, or
  release the claim and refuse); comments share the posts route's 10/hr
  Herald allowance; a migration relaxes notifications.subject_id to text so
  follow_trade and crest ravens stop failing silently, and all eleven raw
  notification inserts now go through createNotification so per-type
  preferences and the live badge govern every kind; referral ravens render;
  handle checks stop treating underscores as wildcards (profile and twice in
  onboarding, where a referral could credit the wrong member); the cron duel
  award joins the daily social cap; war rewards distinguish a missing RPC
  from an honest no; paid ceilings and the redemption guess budget fail
  closed; profile sync derives avatar and wallet from the verified Privy
  token; checkout refuses an idempotent reuse whose cart changed; whisper
  sends re-check blocks; the fulfillment sweep cannot re-ship; media-origin,
  id-shape and filter-escape checks each live in one shared place.
- Back navigation is one standard flow realm-wide: BackButton retraces only
  when the step behind is inside the realm (Navigation API, per-tab depth
  fallback, decided at press time) and otherwise goes to the surface's real
  parent. The Keep, public profiles and the safety report gained missing
  controls; raw history.back() in the battle engine is guarded; the
  composer's Close retraces; detail pages fall back to their own parents.
- Backend hardening (Agent 3, all items landed): per-profile rate limits on
  posts (with a tighter @raven allowance), scanner, whispers, rooms and the
  four trade routes; callerKey metering on the public coin, token and watch
  routes; upload admission by magic bytes; quests and duels sealed behind a
  fail-closed realm flag with limits; referral activation >= 3 with a guarded
  flip; notifyFollowers batched (one read, chunked settings, bulk inserts,
  bounded broadcast pool); war_state created from the table's own defaults,
  hand-written fallback deleted; profile/sync derives the wallet from the
  verified Privy token.
- Checkout persists the shipping address the stores were already sending,
  refuses a physical cart without one server-side, and the normaliser accepts
  the `postal` spelling the stores actually send (a new finding: every real
  address would have normalised to null). The fulfillment worker is on the
  cron schedule.
- Frontend (Agent 2, all items landed): generateMetadata on the raven, Call,
  Keep and House hall detail routes; honest error states with retry on
  search, ravens, bookmarks, renown and the Keep, behind delayed skeletons;
  Vault Swap action opens /swap and the placeholder is deleted; sitemap ranks
  /calls and demotes /throne; kitchen sink is dev-only; search on the Avatar
  and EmptyState primitives; Mint teaser narrowed to what is genuinely
  unbuilt; admin commerce panels for redemption codes and refunds.
- Dead code: nine orphan modules and four caller-less API routes deleted
  after independent re-verification; wagmi and playwright-core removed.
  components/coin/watchlist.ts kept, it has a live import.
- battle_id enforcement checked and deliberately not tightened: the current
  war client never calls the start action, so requiring a session today would
  break every settle. The session path exists; wiring the client start call
  is the prerequisite, queued below.

- Baseline verified green at sprint start: typecheck clean, 874 tests, 18
  house rules, production build passing.
- Five lint errors cleared; the React Compiler no longer skips the ravens
  page, Alms panel, tokenomics donut, games section or wallet send flow.
- Unused-vars and exhaustive-deps lint backlog cleared. Zero lint errors.
- CI lint step flipped from report-only to a hard gate.
- Stray 814KB screenshot removed from the repo root.
- Profile hit rate reads the full settled-call record from /api/calls/caller
  instead of the fifty-post window (closes B3).

## NEXT (ready to build, prioritized)

- FOUNDER: apply the two pending migrations to the production database
  (20260827090000 ballot privacy and war gold cap, 20260828093353
  notifications subject_id to text). The Supabase account connected to this
  workspace does not include the production project, so no session here can
  apply them. Until then the code degrades honestly, but crest and
  follow_trade ravens stay undelivered and war gold is capped only by the
  legacy settle.
- Wire the war client to call the battle start action, then require
  battle_id server-side so a settle can no longer be entirely
  client-asserted (house rule 8; the route's session path is ready).
- Founder decision then flag flips: chests_live, mercer_live, reliquary_live
  once prices are confirmed and the payment provider account exists (V2
  section 40 founder-only list).
- Set ZEROX_API_KEY and PLATFORM_FEE_RECIPIENT in Vercel to take the trading
  surfaces out of their honest warming-up state.

## DEFERRED (good idea, not this sprint)

- The 91 react-hooks/set-state-in-effect warnings: refactoring ninety
  data-loading effects is not sprint-safe. Revisit as its own mechanical pass.
- Finding 31: extracting post-card.tsx (722 lines) into the card registry.
  Right architecture, no user-visible change, real regression risk mid-sprint.
- Finding 39: the RSC migration (53 of 72 pages are "use client"). The
  metadata gap on the four shareable routes is being fixed now; the rest is a
  dedicated wave.
- Finding 33: War relic chests are not provably fair while collectible chests
  are. Either route them through the seed machinery or state the difference
  plainly on the proof page. Needs a product decision on which.
- Finding 40: confirm which EVM RPC provider verify-transfer uses in the
  deployed environment and its unreachable behavior.

## REJECTED (does not fit)

- Finding 29 (one shared formatUsd): the three copies have deliberately
  different rounding tails (2dp on the coin page, whole dollars in the dense
  Scrying rows, rounded integers inside the DNA prompt). One helper would
  change display behavior or grow a config flag. Fails rule 32.
