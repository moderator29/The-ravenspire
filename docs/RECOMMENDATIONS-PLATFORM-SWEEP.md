# Platform sweep: 30 ideas, 12 picked

Grounded in a fresh read of the actual code (three parallel research passes,
each with file:line citations), not guessed. Covers the eight areas named
for this pass: Whispers, the Ravenry, the AI pipeline, the Swap, Privy's
visibility across every real-money flow, Houses, Renown/Crests/the Roll of
Honour, and the Rookery.

## The 30

**Whispers**
1. Typing indicators (the broadcast channel already exists, `whispers:conv:{id}`).
2. Per-message read receipts (`last_read_at` already exists server-side, never surfaced).
3. Finish or explicitly close off group whispers (`conversations.kind` implies it, nothing uses it).
4. Multi-image/video/voice notes (today: one still image).
5. Message reactions (reuse the Rookery's own reaction pattern).

**The Ravenry**
6. Resolve `components/social/inline-composer.tsx`: fully built, mounted nowhere, contradicts the design doc's own stated intent.
7. Real-time refresh for `RealmStrip`'s cells (fetched once on mount today).
8. Ship the 3 already-designed, already-reasoned "not yet" feed card kinds.
9. Consolidate two separate trending-cashtag queries into one.
10. Show a real count on the "new ravens" pill, not just "new".

**The Rookery**
11. "Raise a seat": promote a listener to speaker. Flagged by the room's own code comment as the single largest gap: nothing in the realm can do this today.
12. Host controls: mute a participant, remove from stage.
13. Avatar tiles with an active-speaker pulse, replacing a plain text chip list.
14. Tie the floating reactions to the audio stage, not just the text chronicle.
15. Realtime (not 12s-polled) participant count on the Rookery's own lobby list.

**The AI pipeline (the Herald / @raven)**
16. Stream responses token-by-token instead of one full-completion wait.
17. A "grounded in" strip under a reply, showing the real dossier/platform data the answer actually used.
18. A public feed presence for the Chronicle digest, not only a private per-member note.
19. Proactive, event-triggered Herald reactions (a House overtake, a Crest earned), off the same real event spine.
20. Promote the pre-seal "Herald reads your draft" panel from an on-demand fetch to a live inline read on `/calls/new`.

**Houses**
21. Fold weekly Clashes into the House Hall as its own tab (the design doc already names this as the intended shape; today it's a separate top-level view).
22. A real Ceremony moment the instant a member becomes Lord/Hand/Master-of-X, not a silent recompute.
23. Give House level progression an actual unlock, not just a number climbing.

**Renown, Crests, the Roll of Honour**
24. A real rarity count on every Crest card ("142 members hold this").
25. Ship one more grantable Crest off data the platform already computes (`bannerlord` off the existing activated-referrals logic).
26. A real Ceremony for a member's first Crest, not the badge simply appearing on next load.
27. A richer public per-Crest trophy page: earn date, rarity rank, the real stat that triggered it.

**The Swap: a success card worth sharing**
28. Add "trade" as a real `ShareKind`, an OG card, and a `ShareButton` on `TradeSuccess`, the exact pattern Calls, Keeps, Houses and Crests already use, just never extended to a trade. `POST /api/trade/record` already writes a real, idempotent row with an id; nothing reads it back out as a shareable subject yet.
29. Unify `TipSuccessCard` and `TradeSuccess` into one shared ceremony-card primitive. Two real-money moments, two different looks today.

**Privy: infrastructure, not a brand a member should have to know**
30. Every real signing flow (buy, swap, tip, send, claim) already shows Ravenspire's own confirm step, then Privy's own confirm sheet on top of it, a redundant second dialog in someone else's chrome. Privy's SDK genuinely supports suppressing it per-call (`uiOptions: { showWalletUIs: false }`, verified against the installed package's own types), since the member already confirmed once; and a copy pass removing direct "Privy" naming from product surfaces where it isn't a necessary disclosure (the signin page, the landing page's non-custodial blurb, the wallet send-flow's footer), while keeping it on the Recovery panel, where naming it is the honest thing to do about where backup material actually lives.

---

## The 12 picked

Chosen for real, visible impact across every named area, achievable without
opening a new custody or infrastructure question this pass shouldn't answer
alone (no DCA, no limit orders, nothing that would touch how a key is held).

1. **Suppress Privy's redundant confirm sheet** (idea 30, technical half) across every `sendTransaction` call site: buy, swap, tip, send, claim, the watch bet, the Season Zero vault send. The member's own wallet still signs; only the second, off-brand dialog goes.
2. **The Privy copy pass** (idea 30, copy half): reframe direct "Privy" naming to "your embedded wallet" everywhere it isn't a necessary disclosure.
3. **Rookery: raise a seat.** The flagged biggest gap. A host can invite a listener to speak; a listener can ask.
4. **Rookery: avatar tiles with an active-speaker pulse**, replacing the text chip list, so a live room reads as one at a glance.
5. **A real trade success/share card** (idea 28): `ShareKind`, OG card, `ShareButton` on `TradeSuccess`.
6. **One shared ceremony-card primitive** (idea 29) for both a tip and a trade, so two real-money moments finally look like they belong to the same product.
7. **Stream the Herald's replies** token-by-token instead of a full-completion wait.
8. **A "grounded in" trust strip** under a Herald reply, naming the real data it actually read.
9. **Whispers: typing indicators and read receipts**, one pass, both riding the channel/column that already exist.
10. **The Ravenry cleanup**: resolve the dead inline composer one way or the other, and make `RealmStrip` update live instead of only on mount.
11. **Fold Clashes into the House Hall** as its own tab, matching the shape the design doc already names.
12. **Crests: rarity count and a real first-earn Ceremony.**

Held back deliberately: group whispers, media beyond stills, the three new
feed-card kinds, host mute/remove-from-stage, proactive Herald event
reactions, a public Chronicle feed, House level rewards, a new grantable
Crest, and the richer per-Crest trophy page. All real, all worth doing, none
of them lost, just not in this pass's 12.
