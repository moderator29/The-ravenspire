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

- Agent 3 (backend): rate limits on posts, scanner, whispers, rooms, coin,
  token, watch and the four trade routes; checkout shipping persistence;
  fulfill cron entry; notifyFollowers batching; referral activation >= 3;
  upload magic-byte sniffing; war_state upsert on GET; battle_id enforcement
  check; quests and duels routes gated behind a fail-closed flag; orphan
  module deletion; wagmi and playwright-core removal; dead API route
  verification and deletion; profile/sync wallet derivation.
- Agent 2 (frontend): generateMetadata on post, call, profile and house detail
  routes; search and notifications error states; bookmarks and renown
  skeletons; keep error state; Vault swap action pointed at /swap; sitemap
  corrections; kitchen-sink production gate; search page on primitives; war
  rewards comment correction; soon/mint blurb; admin commerce panels
  (stretch).

## DONE (verified complete)

- Baseline verified green at sprint start: typecheck clean, 874 tests, 18
  house rules, production build passing.
- Five lint errors cleared; the React Compiler no longer skips the ravens
  page, Alms panel, tokenomics donut, games section or wallet send flow.
- Unused-vars and exhaustive-deps lint backlog cleared. Zero lint errors.
- CI lint step flipped from report-only to a hard gate.
- Stray 814KB screenshot removed from the repo root.
- Profile hit rate reads the full settled-call record from /api/calls/caller
  instead of the fifty-post window (closes B3).

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
