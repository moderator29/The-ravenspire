# The Grand Audit of the Realm

An adversarial, eight-area review of the entire platform against the founder's brief.

**261 findings** across 8 areas: 13 critical, 74 high, 108 medium, 43 low, 23 idea.

Some findings were already resolved in the build waves that ran alongside this audit (auth on the Raven, onboarding replay, like minting, cron guard and SQL filter, bookmarks shelf, media pipeline, polls, Whispers, profile editing, referral activation, share metadata, duel expiry). The rest form the Wave 3+ backlog, ordered by severity within each area.


## Games: The War (battle engine, /api/war) and Claim the Throne (quests, duels, Glory economy)

### 1. [CRITICAL/security] /api/war/battle fully trusts the client and can be scripted for infinite Glory and gold `app/api/war/battle/route.ts`
app/api/war/battle/route.ts takes {result, kills, duration_s} straight from the client, caps glory at 400 and pays 40 gold per victory, then calls award() which raises profile glory, renown, tier, and House glory (lib/points.ts). There is no battle session, no server-side start record, no nonce, no cooldown, and no rate limit. A one-line curl loop posting result=victory, kills=140 banks 400 Glory + 40 gold per request forever. The code comment claims 'server-authoritative rewards' but nothing is verified. Because Glory feeds House standings and the Season $RAVEN vault (brief 11.I and section 6B), this is a direct money-adjacent exploit.
**Recommendation:** Add a POST /api/war/battle/start that creates a server-side battle row with seed and started_at; on finish, require the battle id, verify wall-clock elapsed vs duration_s, verify kills against a max kill rate and the actual foe count, mark the row settled (single-use), and rate limit battles per hour per profile.

### 2. [CRITICAL/security] Weekly and seasonal quests are claimable once per DAY via the API (500 Glory daily) `app/api/quests/route.ts`
app/api/quests/route.ts POST sets period = today's date for every quest regardless of cadence. Uniqueness is per (quest_slug, period), so the seasonal 'duel-champion' quest (500 Glory, 250 points) and every weekly quest can be re-claimed every single day with a direct POST, even though no UI exposes them. Claiming all 18 quests daily yields roughly 2,700 Glory per day per account, dwarfing every legitimate loop and poisoning House standings.
**Recommendation:** Derive period from cadence: daily = date, weekly = ISO week (e.g. 2026-W29), seasonal = season id. Reject cadences whose period row already exists, and only accept quest slugs the current UI actually surfaces until verification exists.

### 3. [HIGH/security] Quest completion is pure honor system with zero verification, even where the data exists `app/api/quests/route.ts`
POST /api/quests awards Glory for any quest slug on request. 'Skirmish at Dawn' could be checked against war_battles rows, 'Judge of the Circle' against duel_votes, 'Step Into the Circle' against duels.opponent_id, 'A Worthy Raven' against cheer counts. None are checked. The throne page copy says 'the Watch remembers' (app/(shell)/throne/page.tsx line 397) but the Watch checks nothing.
**Recommendation:** Verify the quests that are verifiable from existing tables before awarding, and auto-complete them server-side when the qualifying action happens (e.g. inside /api/war/battle and /api/duels) instead of a self-report button.

### 4. [HIGH/security] Anti-cheat caps are wrong: 200 kills accepted when only 26 foes exist, 10s victories accepted `app/api/war/battle/route.ts`
app/api/war/battle/route.ts clamps kills to 200, but the engine spawns exactly 26 foes (battle-engine.tsx spawn(1, 26)), so any kills value above 26 is provably fabricated yet still pays kills*2 Glory. duration_s is clamped to a minimum of 10, so a 10 second 'victory' is accepted with no plausibility check against kills or the 150s battle timer.
**Recommendation:** Cap kills at the server-known foe count for the battlefield, reject duration_s below a sane floor for a full clear (or below kills * minimum seconds per kill), and cross-check duration against server-measured elapsed time once battle sessions exist.

### 5. [HIGH/bug] Duels never expire: ends_at is written once and never read `app/api/duels/route.ts`
app/api/duels/route.ts sets ends_at = now + 24h on create, but no code path (no cron, no sweeper, no check in enter/vote) ever consults it. Open duels stay answerable forever, and voting duels that stall below the 5-vote threshold (e.g. 4-4) are stuck in 'voting' permanently with no winner, no refund of the moment, and no closure notification. This is exactly the lifecycle edge case the followup brief's game section implies must work.
**Recommendation:** Enforce ends_at in enter and vote handlers, and add a settle-on-expiry pass (Supabase scheduled edge function or check-on-read) that settles by vote majority at expiry, voids 0-0 duels, and notifies both sides.

### 6. [HIGH/bug] Duel settle race can double-award the winner 60 Glory `app/api/duels/route.ts`
In the vote action, two concurrent voters both read status='voting', both insert votes, both count votes, both pass the threshold, and both run the settle block: two updates to status='settled' plus two award(db, winner, {glory: 60, points: 30}) calls and two notifications. award() itself is a non-atomic read-modify-write on profiles and houses (lib/points.ts), so concurrent awards also silently lose increments.
**Recommendation:** Make settle conditional: update duels set status='settled' where id=? and status='voting', and only award when that update reports a changed row. Replace award()'s select-then-update with an atomic RPC (update ... set glory = glory + ?) for profiles and houses.

### 7. [HIGH/bug] No SQL schema or migrations anywhere in the repo; every uniqueness guarantee is unverifiable `app/api/war/battle/route.ts`
There is no supabase/migrations directory and no .sql file in the project. The 409 paths in /api/quests (duplicate quest claim) and /api/duels (duplicate vote) depend entirely on unique constraints that exist only in the live database, if at all. war_state defaults (starting gold, unlocked_champions) are also invisible: GET /api/war/battle fabricates a default with gold 200 that may not match the real column default the first insert produces.
**Recommendation:** Check migrations into the repo (supabase db diff), including unique indexes on user_quests(profile_id, quest_slug, period) and duel_votes(duel_id, voter_id), enums for duel status/choice, and explicit war_state defaults matching the API's fabricated default.

### 8. [HIGH/missing-feature] The entire progression loop (daily reward, chests, mastery upgrades) has an API but zero UI `app/api/war/rewards/route.ts`
app/api/war/rewards/route.ts implements daily gold tribute, chest opening with champion unlocks, and gold-priced mastery upgrades, but a grep across app/ and components/ shows nothing calls /api/war/rewards, and no page references chests or mastery. Gold accumulates with no way to spend it; champions beyond the starting 3 are unlockable only through an endpoint no player can reach. Brief 11.H (upgrades, daily rewards) is effectively dark-launched.
**Recommendation:** Build a Rewards/Keep panel on /war: daily claim button with streak, chest inventory and open animation, per-champion mastery upgrade on the champion detail page, and surface gold costs there.

### 9. [HIGH/missing-feature] Champion passives and ultimates are flavor text only; every champion plays identically `components/war/battle-engine.tsx`
Brief 11.C requires each hero to have a working PASSIVE and ULTIMATE with distinct fighting styles. lib/game/champions.ts defines 63 champions with rich passive/ultimate descriptions (Raven's Eye, Shield Wall, Static Charge...), but battle-engine.tsx implements one hard-coded 'ember shockwave' power for everyone (lines 249-268) and never reads champion.passive or champion.ultimate beyond printing the ultimate's name on the intro overlay. Weapon class, attack radius, and attack speed are also ignored (fixed range 46, fixed 0.38s cooldown).
**Recommendation:** Implement 3-5 ultimate archetypes (AoE nova, cone strike, self-shield, chain lightning, execute) mapped per champion, wire passives as simple modifiers (dodge chance, stacking defense, third-hit bolt), and vary range/cooldown by weaponClass.

### 10. [HIGH/missing-feature] Brief 11.E combat verbs are missing, including the explicitly required dodge `components/war/battle-engine.tsx`
11.E lists walk/run/sprint/charge/block/dodge/roll/parry/counter/heavy-attack/crit/stun/bleed/burn/freeze/knockback and says player inputs are 'Attack / Power / Block, plus dodge'. The engine has move, tap-attack, one AoE power, and a block that multiplies damage by 0.2. No dodge or roll input exists, no crits, no status effects, no knockback, no hitstop, and no screen shake despite 'satisfying feedback' being named. Soldier AI has no pathfinding or obstacle avoidance (open field, straight-line seek) and never uses abilities.
**Recommendation:** Add a dodge-roll on double-tap or a fourth button with i-frames, crits with hitstop (freeze dt for ~60ms) and a 2-3px canvas shake, and at least burn (ember DoT) and knockback on the power, which are cheap wins in the existing canvas sim.

### 11. [HIGH/missing-feature] Most 11.J screens are absent: no Battle Prep, Store, Inventory/equip, Battle Pass, War leaderboard, Replay, Spectator, Mail `app/(shell)/war/page.tsx`
Brief 11.J demands every screen exist. What exists: War hub, Champions grid + detail, Arsenal (browse-only), Quick Battle HUD, Victory/Defeat card. Missing entirely: Battle Preparation, Matchmaking, Rewards screen (chests), Battle Pass, Store, per-mode Leaderboard, Replay viewer, Spectator mode, Mail, Friends. Campaign, Ranked, and House War are 'Soon' tiles (app/(shell)/war/page.tsx lockedModes). The Arsenal has 15 weapons with art but no inventory, no equip flow, no forge (11.D says 'Inventory, Forge, and equip flows all functional').
**Recommendation:** Prioritize the loop-closing screens first: Battle Prep (champion + battlefield select), Rewards/chests, a War leaderboard fed from war_state, then an equip flow that maps arsenal weapons to small stat mods used by the engine.

### 12. [MEDIUM/bug] Duel enter has a race: two entrants can both pass the open check and the last write wins `app/api/duels/route.ts`
The enter action reads the duel, checks status==='open', then updates opponent fields without a conditional guard (.eq('status','open') is missing on the update). Two simultaneous entrants both succeed; the second silently overwrites the first entrant's riposte, and the first entrant believes they are in a duel they are not in.
**Recommendation:** Use a guarded update (where status='open' and opponent_id is null), check the affected row count, and return 'already answered' to the loser of the race.

### 13. [MEDIUM/security] Sybil voting decides duels: 5 alt accounts crown any winner `app/api/duels/route.ts`
Duel settlement is 5 votes with a lead of 2 (app/api/duels/route.ts line 101). Only the two duelists are barred from voting; onboarding is the only gate. Five throwaway accounts settle any duel instantly for 60 Glory + 30 points, and each alt also collects 2 points per vote ('duel_vote' award), so collusion is directly rewarded. Glory feeds the Season vault, giving this real incentive.
**Recommendation:** Weight or gate votes by account age, tier, or prior activity; scale the settle threshold with realm size; add per-IP and velocity heuristics; and log vote graphs for the admin moderation panel.

### 14. [MEDIUM/security] Duel vote 'choice' is not validated server-side before insert and award `app/api/duels/route.ts`
The vote handler checks only truthiness of body.choice before inserting it into duel_votes and awarding 2 points. Unless a DB check constraint exists (no migrations are in the repo to prove it), choice='banana' inserts fine, consumes the voter's unique vote, earns points, and counts toward neither side, skewing the 5-vote threshold math.
**Recommendation:** Validate choice against the literal union ('challenger' | 'opponent') in the handler and add a DB check constraint on duel_votes.choice.

### 15. [MEDIUM/bug] Mastery upgrades cost real gold but change nothing in battle `app/api/war/rewards/route.ts`
The upgrade action in app/api/war/rewards/route.ts charges 120 + level*60 gold and increments war_state.mastery, but components/war/battle-engine.tsx derives player stats only from the static champion.stats and never reads mastery, and /api/war/battle ignores it for rewards too. A player who paid for mastery 10 gets exactly the same battle as mastery 0.
**Recommendation:** Pass the mastery level into BattleEngine and scale pStats (e.g. +3 percent per level to hp/atk), and reflect it in the champion detail page so the purchase is visible.

### 16. [MEDIUM/missing-feature] Only 1 of 9 briefed battlefields is playable, and even the API's 4 are unreachable `app/(shell)/war/battle/page.tsx`
Brief 11.F lists 9 battlefields. app/api/war/battle/route.ts whitelists 4 (river-crossing, castle-siege, snow-valley, dark-fortress), but app/(shell)/war/battle/page.tsx hardcodes battlefield: 'river-crossing' (line 31) and the engine hardcodes the River Crossing label (battle-engine.tsx line 636) and a single /game/battlefield.png background. There is no battlefield select anywhere, so 3 whitelisted battlefields plus 5 briefed ones do not exist for players.
**Recommendation:** Add a battlefield picker on the battle prep step, per-battlefield background art and spawn/terrain presets in a lib/game/battlefields.ts, and pass the choice through to the engine and the API.

### 17. [MEDIUM/bug] 'Deterministic core' is a fixed seed with no replay system, making every battle identical `components/war/battle-engine.tsx`
battle-engine.tsx seeds mulberry32(1207) as a constant, so enemy positions and speeds are the same every single battle: players memorize the layout, and the daily 'Fight again' loop is literally the same fight. Meanwhile the actual brief goal of determinism ('replayable/spectatable', 11.E and 11.K anti-cheat via deterministic replays) is unmet because player inputs are never recorded and nothing can be replayed.
**Recommendation:** Issue the seed from the server per battle session (also anti-cheat groundwork), record timestamped inputs, and store them with the battle row so a replay viewer can re-simulate; vary the seed per battle.

### 18. [MEDIUM/bug] AFK victories: the ally army can win the battle for an idle player `components/war/battle-engine.tsx`
Allies (22 units, atk 7) fight foes (26 units, atk 6.4) autonomously. If the player hides in a corner, the timeout condition finish(alliesAlive >= foesAlive ? 'victory' : 'defeat') (battle-engine.tsx line 345) can hand a victory with 0 kills, and /api/war/battle still pays the flat 120 Glory + 40 gold victory floor. Also inconsistent: the rout branch adds +120 client glory but the timeout victory adds nothing, so identical results show different client numbers.
**Recommendation:** Scale the server victory floor by kills or damage contribution (e.g. 40 base + kills*4, capped), and make the client's timeout-victory glory bonus match the rout branch.

### 19. [MEDIUM/ux] Locked champions are playable via URL, then the reward silently fails while the UI shows fake Glory `app/(shell)/war/battle/page.tsx`
app/(shell)/war/battle/page.tsx accepts any ?champion= slug with art, including locked ones (the lock is only cosmetic in the UI). After the fight, /api/war/battle returns 403 'not sworn', handleEnd ignores the error (line 27-39), serverGlory stays null, and the results screen renders the client-computed glory as '+N Glory' as if it were banked. The player is lied to twice: allowed to fight a hero they do not own, then shown earnings that were never recorded.
**Recommendation:** Gate the battle page on the unlocked list (redirect to the champion page with an unlock CTA), and on API failure show the server error state ('Glory not banked: that champion is not sworn to you') instead of the client number.

### 20. [MEDIUM/ux] Client Glory math disagrees with server Glory, so the banked number visibly shrinks `components/war/battle-engine.tsx`
The engine computes glory with a streak multiplier up to x3.2 plus a 120 rout bonus (kills at 10-14 base each), routinely showing 500-800 on the HUD meter. The server recomputes as (120 or 30) + kills*2, capped 400 (app/api/war/battle/route.ts line 38), so a 25-kill victory shows about 600 in the HUD and then the results card swaps to +170 when serverGlory arrives. Nothing explains the drop, and gold earned (+40) is never shown at all on the victory screen.
**Recommendation:** Use one shared formula (export it from a lib/game/glory.ts used by both engine and route), and add a gold line to the victory breakdown.

### 21. [MEDIUM/ux] Only 5 of 8 daily quests are shown and weekly/seasonal quests have no UI at all `app/(shell)/throne/page.tsx`
app/(shell)/throne/page.tsx line 152 does quests.filter(daily).slice(0, 5), permanently hiding 'vote-in-a-duel', 'banner-check-in', and 'war-skirmish' (the one quest that bridges to The War). The 6 weekly and 4 seasonal quests defined in lib/game/quests.ts are rendered nowhere in the app (grep confirms only the throne page imports quests). Content was authored, wired into the API, and then never surfaced, while remaining claimable by curl (see the period exploit).
**Recommendation:** Show all 8 dailies plus tabs for weekly and seasonal with progress, and only after the API verifies periods per cadence.

### 22. [MEDIUM/bug] Quest completion GET filter is cadence-blind, so weekly completions vanish from the UI after midnight `app/api/quests/route.ts`
GET /api/quests returns rows with period >= today (app/api/quests/route.ts line 16). A weekly quest claimed yesterday is filtered out, so the throne page would render it as available again (and the POST would happily re-award it, compounding the period bug). Even after periods are fixed per cadence, this gte-today filter is wrong for weekly and seasonal rows whose period key is before today.
**Recommendation:** Return completions for the current daily period, current ISO week, and current season explicitly, keyed by cadence.

### 23. [MEDIUM/security] Duel creation has no rate limit and the throne shows only the 10 newest, so spam buries all real duels `app/(shell)/throne/page.tsx`
POST /api/duels action=create has no per-user cooldown or cap, and app/(shell)/throne/page.tsx loadDuels() fetches order created_at desc limit 10 with no pagination or status filter. Ten junk duels from one account hide every open and voting duel in the realm. Combined with never-expiring duels, the list degrades permanently.
**Recommendation:** Cap open duels per user (e.g. 2 concurrent, 5 per day), filter the list by status with tabs (Open / Voting / Settled) and pagination, and prioritize duels needing votes.

### 24. [MEDIUM/security] Custom duel prompts and entries bypass all moderation `app/api/duels/route.ts`
The platform has a moderation admin area (app/admin/moderation), but /api/duels accepts arbitrary custom prompts (slice 200) and entries (slice 400) with no content check, no link stripping, and no report path. These strings render on the public throne page for every visitor, signed-out included, making duels the easiest abuse and phishing-text vector on the site.
**Recommendation:** Run duel prompts/entries through the same moderation pipeline as posts (or an Anthropic moderation pass given the existing integration), and add a report action wired to the admin queue.

### 25. [MEDIUM/bug] Chests can only ever come from the Sunday daily claim, and the copy lies about it `app/api/war/rewards/route.ts`
In app/api/war/rewards/route.ts, chest = 1 only when getUTCDay() === 0 on the daily claim; /api/war/battle never grants chests, yet the error message says 'Battles and devotion earn them.' With the rewards UI also missing, the champion-unlock funnel is: reach a hidden endpoint, on a Sunday, then beat a 35 percent roll. The brief's 'rest earnable via play / Glory / $RAVEN' (11.C) has no real path.
**Recommendation:** Grant chests from battle milestones (first win of the day, every 5 wins, win streaks), and add a Glory- or gold-priced chest in a Store screen; fix the copy to match reality.

### 26. [MEDIUM/performance] Glory economy is dominated by The War and unbalanced against the social loop `app/api/war/battle/route.ts`
Even played legitimately, a 2.5-minute battle yields up to 400 Glory plus the 40-Glory war-skirmish daily, while the highest social daily pays 40 and a duel win pays 60 after collecting 5 crowd votes over hours. House standings (throne page) therefore reduce to whoever grinds Quick Battle most, undermining the 'house-rivalry social game' framing in followup item 3a. There are also no diminishing returns: the 2nd through 50th battle of the day pay identically.
**Recommendation:** Add diminishing returns after N battles per day (e.g. full Glory for 5, then 25 percent), raise duel and social payouts, and route only a capped daily amount of War Glory into House standings.

### 27. [MEDIUM/bug] Stale duplicated route tree serves placeholder pages for both games at /app/war and /app/throne `app/(shell)/app/(shell)/war/page.tsx`
app/(shell)/app/(shell)/ contains a full leftover tree (war, throne, watch, raven, and 16 more) whose pages render SectionPlaceholder stubs. These resolve at literal URLs like /app/war and /app/throne, so a mistyped or stale link shows a 'coming soon' placeholder for games that actually shipped, and the dead tree bloats the build and confuses navigation greps.
**Recommendation:** Delete the nested app/(shell)/app directory, or if the /app prefix must survive for old links, replace it with redirects to the real routes.

### 28. [LOW/bug] Battle HUD army bars use hardcoded denominators divorced from actual spawn counts `components/war/battle-engine.tsx`
setHud divides alliesAlive.length / 22 and foesAlive.length / 26 (battle-engine.tsx lines 363-364) while spawn(0, 22) and spawn(1, 26) are defined elsewhere. Any tuning of army sizes silently breaks the bars (overflow past 100 percent or never-full). The uneven 22 vs 26 start also means the foe bar begins visually equal despite a different denominator, hiding the fact the player is outnumbered.
**Recommendation:** Capture initial counts as constants used by both spawn and HUD normalization, and consider showing outnumbered status explicitly.

### 29. [LOW/bug] Global key listeners run during the intro overlay and hijack Space for the whole page `components/war/battle-engine.tsx`
battle-engine.tsx attaches window keydown/keyup on mount (line 471), before the player presses 'Sound the horns'. Space is preventDefault-ed globally (line 463), so page scrolling with Space breaks anywhere on /war/battle even pre-battle and after defeat until unmount. Held Space also machine-guns attacks via key repeat, trivializing the 0.38s attack cooldown compared to tapping the button on mobile.
**Recommendation:** Attach key handlers only while started and not ended, and gate repeat by ignoring e.repeat for the attack action.

### 30. [LOW/ux] Voting duels show no vote tallies, no settle rule, and no countdown `app/(shell)/throne/page.tsx`
The throne page voting card (app/(shell)/throne/page.tsx lines 595-641) renders two entries and vote buttons but never shows current votes, the 5-votes-lead-2 settle rule, or time remaining (ends_at is not even selected in DUEL_SELECT). Voters get 'Your voice is counted' and no sense of impact; duelists cannot tell how close settlement is. There is also no indication you already voted until you try again and hit the 409.
**Recommendation:** Select vote counts (view or RPC), render a tally bar per side, show the settle rule and an ends_at countdown, and disable buttons for users who already voted.

### 31. [IDEA/idea] Server-issued battle sessions double as anti-cheat and the replay system `components/war/battle-engine.tsx`
One mechanism solves three brief requirements at once (11.K anti-cheat, 11.E deterministic replays, 11.J replay viewer): POST /api/war/battle/start returns {battle_id, seed}; the engine seeds mulberry32 from it and records inputs; finish posts inputs + outcome; the server can spot-check by re-simulating (the engine's step() is already pure enough to extract into lib/game/sim.ts and run in an edge function), and the stored input log IS the replay for the viewer and spectator mode.
**Recommendation:** Extract the step function from battle-engine.tsx into a shared isomorphic module, add the start endpoint, and store input logs on war_battles rows.

### 32. [IDEA/idea] Bridge the two games: House War weekends fed by both Glory sources `app/(shell)/war/page.tsx`
Claim the Throne and The War currently only touch through the shared Glory counter. A weekly 'House War' event (already a locked tile on /war) could sum each House's War battle wins Friday-Sunday, apply a multiplier to duel wins between members of the top two Houses, and pay a House-wide chest. This makes the social game drive battle participation and vice versa, exactly the fusion followup item 3 describes, and it reuses existing tables (war_battles.profile_id joined to profiles.house_slug) with no new engine work.
**Recommendation:** Ship as a read-mostly leaderboard page plus a weekly settlement job before building real-time guild battles.

### 33. [IDEA/idea] Turn the dead rewards API into a visible daily loop with streaks and a starter battle pass `app/api/war/rewards/route.ts`
The pieces already exist server-side (daily tribute, chests, mastery in app/api/war/rewards/route.ts) and content-side (18 quests in lib/game/quests.ts). A single 'Campaign Ledger' panel on /war showing daily claim streak, chest count with an open animation, and a free 10-tier battle pass whose XP is simply Glory earned this week would close the retention loop the brief demands (11.H battle pass, daily rewards) with almost no new backend.
**Recommendation:** Add war_state.streak and pass_xp columns, tier rewards drawn from existing gold/chest/champion-unlock grants, and surface it beside the mode grid.


## Social core (feed, posts, comments, profiles, houses, notifications, whispers, bookmarks, explore)

### 1. [CRITICAL/security] /api/raven is an unauthenticated Anthropic proxy `app/api/raven/route.ts`
app/api/raven/route.ts POST performs no requireProfile check and no rate limiting. Anyone on the internet can POST arbitrary message arrays and burn the founder's Anthropic credits at will, and also use it as a free LLM endpoint. Every other write route authenticates; this one, which costs real money per call, does not.
**Recommendation:** Require a verified Privy profile (onboarded) for /api/raven, add per-user rate limits (for example 20 requests per hour), and cap tokens per reply.

### 2. [HIGH/security] Onboarding endpoint can be replayed to farm unlimited points `app/api/onboard/route.ts`
app/api/onboard/route.ts never checks profile.onboarded. A user can call it repeatedly: each call re-runs award(db, id, {points: 50, glory: 20}) for took_the_black, re-increments houses.member_count (line 60-69), and lets them hop handles and Houses at will. With glory feeding House standings and points feeding the Season merkle-drop (brief 5.0, 6B), this is direct reward inflation.
**Recommendation:** Reject the call if profile.onboarded is true (or make it idempotent: award and increment member_count only on the first transition), and move member_count to a trigger or SQL increment.

### 3. [HIGH/security] Like, unlike, relike loop mints unlimited points for the author `app/api/social/route.ts`
In app/api/social/route.ts the like branch awards the post author 1 point on every successful reaction insert (lines 50-55). Unlike deletes the reaction row, so like -> unlike -> like can be cycled forever from a second account, minting renown and spamming a fresh notification row each cycle. The points ledger has no dedupe per (liker, subject).
**Recommendation:** Award like points at most once per (liker, subject) pair (check the ledger by reason+ref+actor, or keep a first_liked marker), and dedupe like notifications the same way.

### 4. [HIGH/bug] Call verdict cron stalls permanently after 200 settled Calls `app/api/cron/verdicts/route.ts`
app/api/cron/verdicts/route.ts fetches kind=call posts ordered oldest first with limit(200), then filters verdict !== 'open' in JS. Settled calls stay in the query window forever, so once 200 old calls exist, newer open Calls are never reached and never settle. Call verdicts are the engine of the Signal tab, create-to-earn, and Claim the Throne (brief 5.1, 5.0), so this silently kills a core loop.
**Recommendation:** Filter in SQL on the JSON field (call->>verdict = 'open') and on maturity time, ordered oldest first, so the window always contains only work to do.

### 5. [HIGH/security] Verdict cron is publicly callable, letting authors time their own settlement `app/api/cron/verdicts/route.ts`
GET /api/cron/verdicts has no CRON_SECRET or auth header check. Settlement uses the live price at whatever moment the endpoint runs, so anyone with a matured open Call can poll the price and hit the endpoint exactly when the price crosses their entry, converting a coin-flip into a near-guaranteed hit (worth 40 points and 25 glory). This corrupts the verified-outcome reputation the brief calls provable (5.0, R2).
**Recommendation:** Verify the Vercel cron secret (Authorization header) and settle against the price at the maturity timestamp (store a snapshot or use a historical price API) rather than the price at invocation time.

### 6. [HIGH/missing-feature] DMs (Whispers) are a facade, not a feature `app/(shell)/whispers/page.tsx`
Brief 5.6 requires DMs, group chats, and House chats with search and realtime at launch. app/(shell)/whispers/page.tsx renders a decorative search input wired to nothing and a permanent empty state that says 'Whispers open realm-wide shortly'. There are no message tables in the Supabase schema, no API, and the profile page has no Message button.
**Recommendation:** Ship a real conversations + messages schema (RLS scoped to participants), Supabase realtime delivery, and a Message action on profiles, or honestly label Whispers as Coming Soon in the nav instead of presenting a dead search box.

### 7. [HIGH/bug] Bookmarks can be written but never read: the shelf is unreachable by design `app/(shell)/bookmarks/page.tsx`
PostCard posts bookmarks via /api/social, but app/(shell)/bookmarks/page.tsx renders a static 'the shelf syncs shortly' card and never queries anything. Worse, the bookmarks table has RLS enabled with zero policies (verified on the live ravenspire project), so the client-side anon Supabase key used by lib/social/queries.ts could never read them anyway. Users are saving posts into a black hole.
**Recommendation:** Add a GET endpoint (or an owner-scoped RLS policy) that returns the caller's bookmarked posts with the standard post select, and render them with PostCard on the bookmarks page.

### 8. [HIGH/missing-feature] No media at all: no image upload, no video, and post.media is never rendered `components/social/composer.tsx`
Brief 5.1 requires images (up to 4) and video in posts, 5.3 requires in-feed short video, 5.10 requires a rich composer. components/social/composer.tsx is text plus a Call toggle only. The API accepts a media array of arbitrary client-supplied URLs (app/api/posts/route.ts line 74, unvalidated, a hotlinking and content-injection vector), yet components/social/post-card.tsx never renders post.media, so even seeded media is invisible. No Supabase storage usage exists anywhere in the repo.
**Recommendation:** Add Supabase Storage upload with type and size validation in the composer, render a 1-4 image grid and video player in PostCard, and reject non-storage URLs server-side.

### 9. [HIGH/missing-feature] Polls exist in schema and API but have no compose UI, no rendering, and no vote endpoint `app/api/posts/route.ts`
app/api/posts/route.ts accepts kind poll and stores options, the live DB has a poll_votes table with a (post_id, voter_id) primary key, and there is even a poll icon in components/ui/icon.tsx. But the composer has no poll builder, PostCard never renders post.poll, and app/api/react/ is an empty directory (an apparently abandoned vote route). Brief 5.1 lists polls as a launch post type.
**Recommendation:** Build the poll composer (2-4 options), render options with vote percentages in PostCard, and ship a vote endpoint that upserts into poll_votes and updates counts atomically; delete the empty app/api/react directory.

### 10. [HIGH/missing-feature] Re-ravens never appear in any feed, making repost a counter that does nothing `lib/social/queries.ts`
Reposting inserts into the reposts table and bumps repost_count (app/api/social/route.ts lines 123-151), but lib/social/queries.ts fetchFeed selects only from posts. Nothing ever reads the reposts table, so a re-raven has zero distribution: it does not appear in the reposter's profile, their followers' feeds, or anywhere. Quote text is accepted by the API but no UI can send it. There is also no way to undo a repost.
**Recommendation:** Merge reposts into feed queries (union posts with reposts joined to the original, ordered by repost time), show 'X re-ravened' attribution in PostCard, add a quote composer, and support toggling the repost off.

### 11. [HIGH/missing-feature] No profile editing anywhere: avatars, banners, and bios are unattainable `components/social/profile-view.tsx`
Brief 5.2 requires cover banner, avatar, bio, and links, and section 7 requires a Profile settings area. No API route in app/api ever writes avatar_url, banner_url, bio, or links (grep confirms only notifications reads avatar_url), and the own-profile view (components/social/profile-view.tsx line 77) shows a dead 'This is your Keep' chip instead of an Edit Profile button. Every human user is a letter tile forever, which flattens the entire creator-first premise.
**Recommendation:** Ship a profile PATCH endpoint (display name, bio, links, avatar and banner via Supabase Storage) plus an Edit Profile sheet from the Keep, and pull the X avatar from Privy at first login as a default.

### 12. [HIGH/security] profiles RLS exposes privy_id, wallet_address, settings, and is_admin to anonymous clients `lib/social/queries.ts`
The live ravenspire project has a single 'public read using true' policy on profiles with no column privileges, and the browser talks to Supabase directly with the anon key (lib/supabase/client.ts usage in lib/social/queries.ts). Anyone can select privy_id, wallet_address, is_admin, streak, and the settings JSON for every user. is_admin enumeration hands attackers a target list, and privy_id plus wallet correlation is a doxxing aid the UI never intended to publish.
**Recommendation:** Replace the blanket policy with a view or column grants exposing only public fields (handle, display_name, avatar_url, banner_url, bio, house_slug, tier, renown, x_handle, is_agent, created_at), keeping sensitive columns service-role only.

### 13. [MEDIUM/bug] Viewer state (liked, bookmarked, reposted, following) is never hydrated, so counts lie `components/social/post-card.tsx`
components/social/post-card.tsx initializes liked, reposted, and bookmarked to false on every mount, and profile-view.tsx initializes following to false. A user who liked a post yesterday sees an unfilled heart; tapping it shows +1 locally while the server insert fails on the (profile_id, subject_type, subject_id) primary key and is silently swallowed, so the UI count drifts from reality. Someone already following a creator always sees 'Follow'. Unliking something liked in a previous session is impossible without first faking a like.
**Recommendation:** Batch-fetch the viewer's reactions, bookmarks, reposts, and follow edges for the visible posts (one IN query each) and seed component state from it; reconcile optimistic updates with the server response.

### 14. [MEDIUM/bug] Nested anchors: PostCard wraps RichBody links inside a Link `components/social/post-card.tsx`
components/social/post-card.tsx line 135 wraps the body in a Link to /post/[id], and components/social/rich-body.tsx renders Link and anchor elements for @mentions and URLs inside it. Nested <a> tags are invalid HTML; browsers split them unpredictably, React hydration warns, and taps on a mention can navigate to the post instead of the profile.
**Recommendation:** Make the card a click target via onClick with router.push (ignoring clicks on inner anchors), or only wrap non-link text segments, never a container that includes RichBody.

### 15. [MEDIUM/bug] All engagement counters use read-then-write updates that lose increments under concurrency `app/api/social/route.ts`
like_count, reply_count, repost_count, view_count, houses.glory, and profile points totals are all updated by selecting the current value and writing value+1 (app/api/social/route.ts, app/api/comments/route.ts lines 43-46, lib/points.ts award). Two concurrent likes on the same post read the same count and one increment is lost. On a social feed where a popular post gets bursts of likes, counts will visibly undercount, violating the real-data rule (R2).
**Recommendation:** Use atomic SQL (update posts set like_count = like_count + 1) via an RPC or database triggers on the reaction, comment, and repost tables; derive profile totals from the points_ledger.

### 16. [MEDIUM/security] Zero rate limiting on posting and commenting makes points farming and feed flooding trivial `app/api/posts/route.ts`
Brief 5.0 demands points weighted by quality with sybil resistance ('reward outcomes and quality, never spam'). In reality /api/posts pays a flat 5 points and 2 glory per post and /api/comments pays 2 points per comment with no per-user cooldown, daily cap, or dedupe. A trivial loop with a valid Privy token farms unbounded renown (tier ladder to King) and floods The Ravenry, and each comment containing @raven also triggers a paid Anthropic call via maybeRavenReply.
**Recommendation:** Add per-user rate limits (posts per hour, comments per minute), daily point caps per reason, weight awards by Standing as the brief specifies, and throttle @raven invocations per user per hour.

### 17. [MEDIUM/missing-feature] @mentions of other users never notify anyone `app/api/comments/route.ts`
Brief 5.4 lists @mentions in comments and 5.9 lists mention notifications as a launch type. app/api/posts/route.ts and app/api/comments/route.ts parse the text only for @raven (maybeRavenReply); a post saying '@torvald you seeing this' produces no notification row, no notification kind exists for mentions, and rich-body.tsx links mentions with a lowercase-only regex so mixed-case typed mentions do not even render as links.
**Recommendation:** Extract @handle mentions server-side on post and comment creation, resolve to profile ids, insert kind 'mention' notifications (respecting future blocks), and make the client regex case-insensitive.

### 18. [MEDIUM/missing-feature] Comments miss most of brief 5.4: no reply UI, no likes, no sort, no delete, no report `components/social/comment-thread.tsx`
The comments API accepts parent_id and the reactions API accepts subject_type comment, but components/social/comment-thread.tsx renders no per-comment Reply button (parent_id is never sent, so threading is dead code), no like button (like_count is fetched and discarded), no Top/Newest sort, no delete-own, no report, and no inline media. Brief 5.4 explicitly requires threaded, like/reply/re-raven, sort, inline media, @mentions, realtime, delete own, report.
**Recommendation:** Add reply and like actions per comment row, a Top/Newest toggle (order by like_count vs created_at), delete-own and report items in a per-comment menu, and wire parent_id from the reply flow.

### 19. [MEDIUM/missing-feature] Comment realtime is a 15 second poll, and thread reads cap at 200 with no pagination `components/social/comment-thread.tsx`
Brief 5.4 says comments are real-time. comment-thread.tsx uses setInterval(load, 15000), refetching the entire thread every 15 seconds for every open post page (needless load, 15s latency), even though the comments table is already in the supabase_realtime publication (verified on the live project). fetchComments also hard-limits to 200 rows with no paging, so busy threads silently truncate.
**Recommendation:** Subscribe to postgres_changes filtered by post_id instead of polling, and paginate comments (roots first, fetch children on expand).

### 20. [MEDIUM/missing-feature] Profile page misses required tabs and actions: Media, Live, Houses, About, Message, Notify, Tip, and the overflow menu `components/social/profile-view.tsx`
Brief 5.2 specifies tabs Posts | Calls | Media | Live | Houses | About, actions Follow, Message, Notify (bell), Tip, and a '...' menu with Share, Copy link, Report, Block. components/social/profile-view.tsx ships only Ravens and Calls tabs and a Follow button. Also absent: joined date, bio links, X follower count (the x_followers column exists in the DB and is never read), and Call win-rate. The stat row and crest row are the only parts of 5.2 fully present.
**Recommendation:** Add the missing tabs (Media can filter posts with media, About can show joined date, links, House), the overflow menu with Share, Report, and Block wired to the existing /api/blocks endpoint, and show win-rate next to Calls won.

### 21. [MEDIUM/missing-feature] Block exists server-side but nothing in the UI calls it, and blocking filters no content `app/api/blocks/route.ts`
app/api/blocks/route.ts implements block, unblock, and mutual follow severing, but grep shows zero client references: no Block button on profiles or posts anywhere. Even if invoked, fetchFeed, fetchComments, and the notifications query ignore the blocks table entirely, so a blocked harasser's posts, replies, and likes still reach the victim. Mute does not exist at all. For a launch social platform this is a serious safety gap.
**Recommendation:** Surface Block in the profile and post overflow menus, filter blocked author ids out of feed, comment, and notification reads (server-side or via the fetched blocked list), and add mute as a lighter client-side filter.

### 22. [MEDIUM/missing-feature] No user-facing report flow despite a reports table and an admin review console `app/api/admin/reports/route.ts`
The live DB has a reports table (RLS enabled, zero policies) and app/api/admin/reports/route.ts lets admins resolve or dismiss reports, but there is no POST endpoint or UI for a user to create one: no Report item on posts, comments, or profiles. The admin moderation queue can only ever be empty. Brief 5.2 and 5.4 both require Report actions.
**Recommendation:** Add a POST /api/reports (subject_type, subject_id, reason enum) with per-user rate limits, and a Report entry in post, comment, and profile menus feeding the existing admin queue.

### 23. [MEDIUM/missing-feature] For You is literally identical to Latest, Signal ignores outcomes, and the brief's filter sheet does not exist `lib/social/queries.ts`
lib/social/queries.ts fetchFeed applies no ranking for the foryou tab, so For You and Latest run the exact same query (two duplicate tabs of five). Signal is defined in brief 5.1 as 'top by verified outcome' but is implemented as kind=call ordered by recency, mixing misses and unsettled calls equally with hits. The required filter sheet (hide AI-agent posts, hide reposts, hide token spam, chain, cashtag, House, media filters) is absent; is_agent is fetched per author but nothing lets users filter Herald posts.
**Recommendation:** Give For You a simple engagement-decay score to start (likes plus replies over age), rank Signal by author verified win-rate or settled-hit recency, and add the filter sheet with an is_agent toggle as the cheapest first win.

### 24. [MEDIUM/bug] Leftover duplicate route tree ships ~20 placeholder pages at /app/* URLs `app/(shell)/app/(shell)/home/page.tsx`
app/(shell)/app/(shell)/ contains a full second copy of the section pages (home, keep, explore, whispers, houses, and more), each rendering SectionPlaceholder. Because route groups do not consume URL segments, these build to live production routes like /app/home and /app/keep that show empty placeholder shells of real features, discoverable by crawlers and typo traffic. It also bloats the build.
**Recommendation:** Delete the entire nested app/(shell)/app directory; it is dead scaffolding from an earlier layout.

### 25. [MEDIUM/performance] The whole social surface is client-rendered: no OG tags, no SSR, broken share previews `app/(shell)/post/[id]/page.tsx`
app/(shell)/post/[id]/page.tsx, u/[handle]/page.tsx, home, houses, and explore are all 'use client' pages that fetch from the browser. A shared post link (the share button copies /post/[id]) unfurls on X, Telegram, or Discord with zero title, image, or text, killing the viral loop a creator platform depends on. Search engines see empty shells. First paint requires a client Supabase round trip behind auth provider hydration.
**Recommendation:** Convert post and profile pages to server components (or add generateMetadata) that fetch via the server client and emit OG and Twitter card tags with the author, body excerpt, and a rendered OG image.

### 26. [MEDIUM/missing-feature] Notifications: no unread badge, forced mark-all-read, cap of 50, none of the brief's channels or toggles `app/(shell)/ravens/page.tsx`
components/shell/top-bar.tsx renders a bare bell with no unread count, so users never know ravens arrived (and the notifications table is even in the realtime publication, unused). app/(shell)/ravens/page.tsx marks everything read the moment the page mounts, before the user has looked. The GET caps at 50 with no pagination. Brief 5.9 requires per-type toggles plus push, email, and Telegram delivery; none exist, and the Whispers, House invite, live-room, and whale alert kinds are absent.
**Recommendation:** Add an unread count (realtime subscription on notifications insert), badge the bell, mark read on interaction or after visible dwell, paginate, and add settings-backed per-type toggles before adding channels.

### 27. [MEDIUM/missing-feature] Houses have no membership list, no join or switch flow, no chat, and no member leaderboard `app/(shell)/houses/[slug]/page.tsx`
Brief 5.5 requires House pages with members, House feed, standing plus leaderboard, House chat, and join or found gated by Standing. app/(shell)/houses/[slug]/page.tsx shows crest metadata, glory, member_count, and a post list only. House choice is locked at onboarding forever (no join or leave endpoint), house_members is written once and never read by any page, and the house feed keys off posts.house_slug stamped at post time, so it is really 'posts by people who were in the House then', not a community space.
**Recommendation:** Add a members tab (top members by glory from house_members join profiles), a join/switch flow with a cooldown to prevent Season hopping, and House chat once messaging lands.

### 28. [MEDIUM/bug] Raven mention on someone else's post notifies the wrong person and never threads the answer `lib/ai/mention.ts`
When a commenter tags @raven on another user's post, lib/ai/mention.ts inserts the reply as a top-level comment (parent_id always null, so it does not attach to the asking comment) and notifies the post author with 'The Raven has answered your raven' (lines 61-67), while the person who actually asked gets nothing. On a busy thread the answer visually detaches from the question entirely.
**Recommendation:** Pass the asking comment's id as parent_id for comment-triggered replies and notify the asker (comment author), not the post author.

### 29. [LOW/bug] Comments API accepts a parent_id from a different post and posts on deleted ravens `app/api/comments/route.ts`
app/api/comments/route.ts inserts body.parent_id without verifying it references a comment on the same post (or any comment at all, depending on FK), enabling corrupt cross-post threads via a hand-crafted request, and the post lookup does not filter deleted=false, so users can reply to soft-deleted posts. Reply notifications also go only to the post author; the parent comment's author is never notified of a reply to them.
**Recommendation:** Validate parent_id belongs to post_id, reject deleted posts, and notify the parent comment author on nested replies.

### 30. [LOW/ux] Unbounded comment nesting indents 32px per level, overflowing mobile `components/social/comment-thread.tsx`
CommentRow in comment-thread.tsx applies ml-8 plus pl-3 per depth level with no depth cap. Brief 5.4 explicitly demands clean nesting on mobile with no overflow, but a 6 deep exchange consumes over 200px of a 360px viewport, squeezing text to a sliver; the API enforces no depth limit either.
**Recommendation:** Cap visual indent at 2 levels (flatten deeper replies with an inline 'replying to @x' label, as X does) and cap depth server-side.

### 31. [LOW/bug] Calls won stat is computed from only the last 50 posts, client-side `components/social/profile-view.tsx`
profile-view.tsx derives callsWon by filtering fetchProfilePosts, which is capped at 50 rows. An active creator's headline stat (brief 5.2: verified performance, Call win-rate) silently undercounts as soon as they pass 50 posts, and no win-rate is shown at all. The Calls tab truncates the same way.
**Recommendation:** Compute calls won and win-rate with a count query (kind=call, call->>verdict) or a cached column updated by the verdict cron, independent of the post page size.

### 32. [LOW/bug] View counting endpoint is dead code and view counts are never displayed `app/api/views/route.ts`
app/api/views/route.ts implements one view per member per day with a post_views table, but grep shows no client code ever calls /api/views, and PostCard never shows view_count (it is not even in POST_SELECT). Creators get no reach signal, and the table plus daily-unique logic sits unused.
**Recommendation:** Fire the view ping from the post detail page (and optionally an intersection observer in the feed), and surface the count on PostCard and in a creator stats row.

### 33. [LOW/bug] Cashtag parsing is inconsistent across three regexes `components/social/rich-body.tsx`
app/api/posts/route.ts extracts cashtags with /\$([a-zA-Z]{2,12})\b/ (letters only), lib/ai/mention.ts uses /\$([a-zA-Z0-9]{2,12})/ (alphanumeric), and rich-body.tsx highlights /\$[a-zA-Z]{2,12}\b/. A token like $PEPE2 gets Raven context but no stored cashtag, no gold highlight, and no price card; the same text renders differently depending on the code path.
**Recommendation:** Extract one shared parseCashtags helper in lib/social and use it in the posts API, mention handler, and RichBody.

### 34. [LOW/ux] Share copies silently and infinite scroll is a button `components/social/post-card.tsx`
PostCard's share handler writes to the clipboard with no toast or confirmation (and swallows failure), so users cannot tell anything happened. Brief 5.1 asks for infinite scroll; feed.tsx ships an 'Older ravens' button instead, and page loads refetch from scratch. The mobile floating '+' compose the brief specifies (section 4) also does not exist; composing requires being at the top of /home.
**Recommendation:** Add a small 'Link copied' toast plus navigator.share on mobile, replace the button with an IntersectionObserver sentinel, and add the floating compose FAB opening the composer in a sheet.

### 35. [LOW/bug] Feed pagination by created_at alone can skip posts, and the following list goes stale `components/social/feed.tsx`
fetchFeed pages with lt(created_at, lastSeen); posts sharing a timestamp (bulk inserts, seeded data, Raven replies in the same ms) get skipped across page boundaries. In feed.tsx, followingIds is cached in a ref for the component's lifetime, so following someone new does not update the Following tab until a full remount, and fetchFollowingIds caps at 1000 with an unbounded IN list that will degrade for big graphs.
**Recommendation:** Use a compound keyset cursor (created_at, id), invalidate the following cache on follow actions, and move the Following feed server-side with a join rather than an IN of up to 1000 ids.

### 36. [LOW/polish] Herald posts are indistinguishable from a compromised admin's, and tie prices settle as a loss for longs `app/api/cron/verdicts/route.ts`
Two small integrity nits: (1) the verdict comparison in cron/verdicts uses strictly greater (rose = price > entry), so an exactly flat price counts every up Call as a miss and every down Call as a hit, a systematic bias with no draw state; (2) is_agent is a plain profiles column readable and theoretically settable only via service role today, but nothing constrains which accounts get the Herald chip if any future write path touches profiles.
**Recommendation:** Add a small neutral band (for example within 0.1 percent settles as a push, points refunded), and enforce is_agent via a DB constraint or dedicated seeding script.

### 37. [IDEA/idea] Hydrate viewer state in one batched call and return authoritative counts from the API `app/api/social/route.ts`
A single endpoint (or one Supabase query per table with IN on visible post ids) returning the viewer's likes, bookmarks, reposts, and follows would fix the stale-toggle class of bugs cheaply, and returning the new count from /api/social lets the client reconcile instead of guessing with +1/-1.
**Recommendation:** Add GET /api/social/state?post_ids=... and include {like_count} in the like response; seed PostCard and ProfileView from it.

### 38. [IDEA/idea] Use the already-published notifications realtime channel for a live bell and toast `components/shell/top-bar.tsx`
The notifications table is already in the supabase_realtime publication (verified live) but has no RLS policy, so nothing can subscribe. Adding an owner-read policy and a filtered subscription gives an instant unread badge and in-app toasts ('A raven arrives: @x admired your raven') with almost no new infrastructure, which is exactly the addictive feel brief 5.x asks for.
**Recommendation:** Add RLS policy notifications_owner_read (profile_id = auth-mapped id, or subscribe via a server-relayed channel given Privy auth), then badge the bell and toast on insert.

### 39. [IDEA/idea] Ship the founder's brief requirements as the next social sprint, in dependency order `components/social/feed.tsx`
The highest leverage sequence given what exists: profile edit + avatars (unblocks identity), media upload + render (unblocks creator content), reposts in feed (unblocks distribution), report + block UI (unblocks safety), then the filter sheet and For You ranking. Each has schema already in place (storage, reposts, reports, blocks, is_agent), so most of this is wiring, not new architecture.
**Recommendation:** Sequence: identity, media, distribution, safety, ranking. DMs and Rookery live rooms are the only items needing genuinely new backend design.

### 40. [IDEA/idea] Version the database schema in the repo `README.md`
There are no .sql files or supabase/migrations directory anywhere in the repo; the entire schema (28 tables, policies, publications) exists only as live state on the ravenspire project. A wrong MCP migration or project incident is unrecoverable, RLS cannot be code-reviewed, and the earlier findings (missing policies on bookmarks, notifications, reports, referrals) went unnoticed exactly because nothing in the codebase declares intent.
**Recommendation:** Pull the current schema into supabase/migrations via the Supabase CLI, commit it, and require future DDL to land as migration files.


## Auth + security (lib/auth, lib/supabase, app/api, RLS reliance, cron, rate limiting, points economy)

### 1. [CRITICAL/security] Quests award points with zero verification the action was performed `app/api/quests/route.ts`
POST /api/quests only checks that the submitted quest slug exists in the static lib/game/quests list, then inserts a user_quests row and calls award() for that quest's points+glory. There is no check that the user actually posted, went live, made a Call, referred someone, etc. Any onboarded member can loop through every quest slug once per day and mint the full daily points/glory for free. Because renown = points + glory and renown drives tiers which convert to $RAVEN at Season snapshots (foundation brief 5.1 and section on points->token), this is a direct, unbounded inflation of the token-convertible economy.
**Recommendation:** Make quest completion server-derived: verify the underlying event happened (e.g. count today's posts/calls/referrals in the DB) before granting, or emit quest progress from the action endpoints themselves rather than trusting a client-chosen slug. Never award on a bare 'mark complete' call.

### 2. [CRITICAL/security] War battle rewards are fully client-reported and uncapped in frequency, enabling infinite glory farming `app/api/war/battle/route.ts`
The comment claims 'server-authoritative rewards' but the client sends result:'victory', kills, and duration_s; the server only clamps magnitudes (glory up to 400 per battle) and writes the reward. There is no cooldown, no match validation, no server-side simulation, and no rate limit. A script can POST {result:'victory', kills:200} thousands of times to mint ~400 glory each call. Glory flows into award()->renown->tier and house glory leaderboards, so this corrupts both the token-convertible economy and House standings.
**Recommendation:** Make battles server-authoritative: the server must run/verify the match outcome, issue a signed battle session token consumed once, and enforce a per-user cooldown and daily glory cap. Do not accept the win/kill outcome from the client.

### 3. [CRITICAL/security] @raven mention path triggers paid Anthropic calls with no rate limit `lib/ai/mention.ts`
maybeRavenReply() runs after every post (app/api/posts/route.ts) and every comment (app/api/comments/route.ts) whose text matches /@raven/. It calls askRaven() (Anthropic claude-sonnet-5, 600 max_tokens) plus up to 3 DexScreener lookups, with NO rate limiting on the posts or comments endpoints. An attacker can spam posts/comments containing '@raven $x $y $z' to run up unbounded Anthropic and API cost. The 20/hour limit only guards /api/raven, not this far cheaper-to-trigger path.
**Recommendation:** Rate-limit posts/comments creation, debounce @raven replies per user/time window, cap daily @raven auto-replies per account, and gate the AI call behind the same shared limiter as /api/raven.

### 4. [CRITICAL/security] Feed, profiles, comments and follows are read directly with the browser anon key, exposing the app entirely to RLS correctness `lib/social/queries.ts`
All reads (fetchFeed, fetchPost, fetchComments, fetchProfile, fetchFollowCounts, subscribeToFeed) use createClient() from lib/supabase/client.ts, i.e. the public anon key in the browser. Writes go through the service role, but every read depends solely on RLS. If the profiles SELECT policy is permissive (a common default), any visitor can query profiles with the anon key and read privy_id, wallet_address, is_admin, points and any other column, not just the curated fields these functions request. The realtime channel on table 'posts' likewise needs broad SELECT. Because the migrations are not in the repo, this is the single biggest unverified attack surface.
**Recommendation:** Confirm RLS on profiles restricts SELECT to a safe public column set (ideally via a view exposing only public fields) and never exposes privy_id/wallet_address/is_admin to anon; lock down posts/comments/follows SELECT policies and the realtime publication accordingly. Add a column-restricted public view rather than relying on client select lists.

### 5. [HIGH/bug] Call settlement re-resolves the token by symbol, not by the stored address, so verdicts can be decided by the wrong token `app/api/cron/verdicts/route.ts`
At creation (app/api/posts/route.ts) a Call stores token symbol, address, chain, and entry_price. But the cron settles with lookupToken(call.token) which searches DexScreener by SYMBOL and picks the highest-liquidity pair (lib/data/tokens.ts). The stored call.address/call.chain are ignored. Symbols are not unique on-chain: settlement can match a completely different token than the one the Call was opened on, producing a false hit/miss and awarding 40 points + 25 glory on bad data. An attacker can even deploy a same-symbol token to steer settlement.
**Recommendation:** Settle using the stored address+chain (lookupToken should accept and match an exact contract address), not the symbol. Lock both entry and settlement to the same pair identity.

### 6. [HIGH/security] In-memory Raven rate limiter is per-instance and resets on cold start, so it does not actually limit `app/api/raven/route.ts`
The 20/hour limit uses a module-level Map keyed by profile.id. On Vercel/serverless each instance has its own Map and instances scale horizontally, so a user hitting different instances multiplies their quota; every cold start also wipes the counter. The Map is also never pruned, so it grows unbounded (memory leak). The 'AI costs real coin' guarantee is effectively unenforced under real deployment.
**Recommendation:** Move rate limiting to a shared store (Supabase table with a windowed counter, Upstash/Redis, or Vercel KV) keyed by profile.id, applied to /api/raven AND the @raven mention path.

### 7. [HIGH/security] Points and all counters use read-modify-write, causing lost updates and enabling concurrency abuse `lib/points.ts`
award() does SELECT points,glory,renown then UPDATE with computed totals; likewise houses.glory and houses.member_count (onboard), posts.like_count/reply_count/repost_count/view_count (social, comments, views), and war_state.gold (war/rewards upgrade). None are atomic. Concurrent requests interleave and lose updates or, worse for gold spending, let a user 'buy' multiple upgrades with the same balance (SELECT gold >= cost twice before either UPDATE lands). This is both a data-integrity bug and an economic exploit.
**Recommendation:** Use atomic SQL (UPDATE ... SET points = points + $delta) or Postgres RPC/stored procedures with row locking for every counter and for gold spends; never round-trip the current value to the app for increments.

### 8. [HIGH/security] No sybil resistance on likes, referrals, duels, follows or points despite brief requiring it `app/api/social/route.ts`
Foundation brief 5.1 explicitly requires 'sybil-resist via Standing/stake'. Accounts are free (Privy email), and there is no stake, device, or Standing gate anywhere. A user can spin up N alts to like a target (each mints 1 point to the author via 'liked_by_<id>'), refer their main (onboard referral), vote in their own duels, and follow to inflate counts. Points feed renown -> tier -> $RAVEN conversion, so the whole reward economy is farmable with throwaway accounts.
**Recommendation:** Gate point-earning actions behind minimum Standing/age/verification (X-verified or wallet with history), add per-actor and per-target daily caps, and require stake or verification before referral/points rewards unlock, as the brief specifies.

### 9. [HIGH/missing-feature] No user-facing report endpoint, so the moderation queue can never be populated `app/api/admin/reports/route.ts`
Admins can GET/resolve/dismiss rows in the reports table, but there is no route anywhere for a member to CREATE a report (grep of app/api shows reports is only read/updated by admin). The foundation brief (8C admin: 'moderate content, resolve reports') and the followup brief admin nav ('Moderation ... Reports') assume a working report flow. Users cannot flag content, so the moderation pipeline is inert.
**Recommendation:** Add an authenticated POST /api/reports that inserts into reports (subject_type, subject_id, reason) with rate limiting and dedupe per reporter/subject, and wire the post/comment/profile UI to it.

### 10. [HIGH/missing-feature] No account/profile settings or security endpoints despite the brief mandating them `app/(shell)/settings/page.tsx`
The settings page only calls POST /api/me (read). There is no API to edit handle, display name, bio, links, avatar/banner, to delete or export the account, or to manage 2FA/sessions/connected apps/The Watch thresholds/SIWE. Foundation brief section 7 (Settings) and 'Account (email, linked X, wallets, @handle, display name, delete, export)' and 'Security (2FA, sessions, connected apps, ...)' require all of this. Users are permanently stuck with the handle/name chosen once at onboarding.
**Recommendation:** Build authenticated settings routes (profile update with validation and handle-change uniqueness/rate limits, account export/delete, security controls). Ensure handle changes re-check uniqueness atomically.

### 11. [HIGH/security] Handle uniqueness is a check-then-write race with no enforced constraint at the app layer `app/api/onboard/route.ts`
Onboard checks handle availability with an ilike SELECT then UPDATE. Two concurrent onboard requests for the same handle both pass the SELECT and both UPDATE, so two users can end up with the same @handle unless a DB unique constraint (unverifiable here) saves it. Even with a unique index, the code doesn't handle the resulting error gracefully (it returns generic 'Could not save'). referral_codes.code is also set to the handle via upsert onConflict owner_id, but nothing guarantees code uniqueness against other users' handles.
**Recommendation:** Rely on a citext UNIQUE constraint on profiles.handle and referral_codes.code, catch 23505 to return 'handle taken', and ensure the referral code namespace can't collide with another user's handle.

### 12. [HIGH/bug] Profile creation on first request has a race that surfaces as a spurious 401 `lib/auth/server.ts`
requireProfile() does SELECT by privy_id -> if none, INSERT ... .single(). A brand-new user firing two requests at once (e.g. onboarding page issuing /api/me and /api/quests together) races: both SELECT miss, both INSERT; assuming privy_id UNIQUE, the loser's insert errors and requireProfile returns null, so a legitimately authenticated user gets 401 'unauthenticated'. There's no upsert or re-select-on-conflict fallback.
**Recommendation:** Use INSERT ... ON CONFLICT (privy_id) DO NOTHING then re-SELECT, or upsert and re-read, so concurrent first-touch requests both resolve to the same profile.

### 13. [HIGH/security] Unvalidated profile_id interpolated into PostgREST .or() filter strings (filter injection) `app/api/blocks/route.ts`
blocks POST builds .or(`and(blocker_id.eq.${profile.id},blocked_id.eq.${body.profile_id}),...`) and whispers POST does the same in its block check. body.profile_id / body.with are never validated as UUIDs before being interpolated into the PostgREST filter DSL. A crafted value containing commas/parens/operators can alter the filter's meaning (e.g. broadening or breaking the OR, or matching unintended rows), a PostgREST-level injection. Because these run with the service role, the blast radius is the whole table.
**Recommendation:** Validate all id inputs against a strict UUID regex before use, and prefer parameterized .match()/.eq() chains or an RPC over string-built .or() filters with user input.

### 14. [HIGH/security] Cron verdicts route is open in non-production when CRON_SECRET is unset `app/api/cron/verdicts/route.ts`
If CRON_SECRET is set, the Bearer check is enforced (good). But the fallback only returns 503 when NODE_ENV==='production'. In any non-production deploy (preview/staging/local with real Supabase creds) with no secret set, anyone can GET /api/cron/verdicts and force settlement of every matured Call on demand, timing awards and using the symbol-lookup weakness to steer verdicts. Cron auth should never be environment-gated.
**Recommendation:** Require CRON_SECRET (or Vercel's cron signature) unconditionally in all environments; if it is absent, refuse (503/500) everywhere, not just in production.

### 15. [MEDIUM/bug] post_views has no per-day component, contradicting the 'one view per day' claim `app/api/views/route.ts`
The comment says 'One view per member per post per day', but the insert is just {post_id, viewer_id} with no date bucket. If there is a UNIQUE(post_id,viewer_id) it is one view per member EVER (never daily); if there is no unique constraint, view_count can be incremented unlimited times by re-posting. Either way the stated semantics are wrong, and combined with sybil accounts view counts are inflatable.
**Recommendation:** Include a day bucket (e.g. viewed_on date) in the row and the unique key if 'per day' is intended, and increment view_count atomically only when the insert actually created a new row (check inserted count).

### 16. [MEDIUM/security] No rate limiting on posts, comments, likes, follows, reposts, duels, rooms or uploads `app/api/posts/route.ts`
Only /api/raven attempts a (broken) limiter. Every other write endpoint is unlimited per user: a script can flood the Ravenry with posts/comments (each also awarding points and possibly triggering @raven), spam follow/unfollow notifications, open unlimited duels and rooms, and upload files to storage without bound. This is a spam, points-farming, notification-abuse, and storage-cost vector across the whole API.
**Recommendation:** Add a shared, per-profile sliding-window rate limiter (and stricter caps for point-earning actions and uploads) enforced centrally in requireProfile or a wrapper.

### 17. [MEDIUM/security] Upload trusts client-declared MIME type and has no scanning or per-user quota `app/api/upload/route.ts`
ext/type validation uses file.type, which the client sets arbitrarily; a non-image payload can be uploaded as image/png. It is stored in a PUBLIC bucket under the uploader's id and served with the client-declared content-type (mitigates HTML XSS since it stays image/*, but not content spoofing, malware hosting, or using the platform as a free CDN). There is no size-per-day quota, no image re-encode/strip, and no magic-byte check.
**Recommendation:** Verify magic bytes server-side, re-encode/strip images, enforce a per-user storage quota and upload rate limit, and set a safe fixed content-type. Consider a signed, private bucket with a CDN transform.

### 18. [MEDIUM/security] Blocks are not enforced in the feed or content queries `lib/social/queries.ts`
blocks are stored (app/api/blocks) and the block also severs follows, but fetchFeed/fetchProfilePosts/fetchComments (anon-key reads) never exclude authors the viewer blocked, nor authors who blocked the viewer. Blocking a user does not remove their posts/comments from the reader's feed or threads; at best the client filters using /api/blocks GET, which is trivially bypassed and inconsistent. This defeats the point of blocking for harassment cases.
**Recommendation:** Enforce block filtering server-side (RLS policy or a filtered API/view that excludes blocked pairs) rather than relying on client-side omission.

### 19. [MEDIUM/security] Duels are self-settleable via alts and vote-farmable `app/api/duels/route.ts`
A duel settles when a side hits 5 votes with a 2-vote lead, paying the winner 60 glory + 30 points and each voter 2 points. Challenger and opponent can be two alts of the same person, and 5 more alts vote to force a settlement, harvesting the winner payout plus per-vote points. The only guards are 'can't vote for yourself' and one-vote-per-duel. No unique-human requirement, no minimum distinct-account age/Standing, and unlimited duel creation (notification spam to challenger).
**Recommendation:** Require voters to meet a Standing/age threshold, cap duel creation and settlement rewards per user/day, and detect obvious collusion (shared referrer/IP/device) before paying out.

### 20. [MEDIUM/security] war/rewards gold upgrade is a double-spend race `app/api/war/rewards/route.ts`
The 'upgrade' action reads state.gold, checks gold >= cost, then UPDATE gold = state.gold - cost with the app-computed value. Two concurrent upgrade requests both read the same gold, both pass the check, and both write (last-writer-wins), so a user can gain two mastery levels for the price of one, or drive gold behavior inconsistently. Same read-modify-write pattern in 'daily' and 'open_chest'.
**Recommendation:** Perform the balance check and debit atomically in a single conditional UPDATE (UPDATE ... SET gold = gold - cost WHERE gold >= cost) or an RPC, and only apply the mastery bump if a row was affected.

### 21. [MEDIUM/bug] Comments can be attached to soft-deleted posts and parent_id is not validated `app/api/comments/route.ts`
The comment insert selects the post by id but does not check deleted=false, so users can keep replying to a removed post (fetchComments hides them, but reply_count and notifications still fire, and points are awarded). parent_id is accepted verbatim with no check that it belongs to the same post or exists, allowing malformed/cross-post threads.
**Recommendation:** Reject comments on posts where deleted=true, and validate that parent_id (when present) is a non-deleted comment on the same post_id.

### 22. [MEDIUM/security] Referral relationship recorded with no anti-abuse gating `app/api/onboard/route.ts`
On onboarding, if a referral code matches and code.owner_id !== profile.id, a referrals row is upserted crediting the referrer. There is no IP/device fingerprint, no minimum-activity requirement at record time, and nothing preventing one person from mass-creating accounts each carrying their own code. The brief's 'Raise Your Banners' promises real $RAVEN + points + Standing rewards, so this is a direct payout-farming path. Rewards 'unlock later' but the tree that determines them is already sybil-poisoned.
**Recommendation:** Fingerprint signups (IP, device, X-verification), require the referred account to reach a genuine activity/Standing threshold funded by real engagement before the referral counts, and de-duplicate obvious clusters.

### 23. [MEDIUM/security] No middleware and admin page gating is client-side only `app/admin/layout.tsx`
There is no middleware.ts (confirmed absent), and lib/supabase/server.ts even references a middleware that 'refreshes sessions' which does not exist. The admin layout decides access in a client useEffect calling /api/me. The data APIs (admin/users, flags, reports, overview) do each re-check is_admin server-side, which is the real protection, but there is no defense-in-depth layer, no route-level auth, and the dead middleware comment is misleading. Any new admin API added without the per-route is_admin check would be silently unprotected.
**Recommendation:** Add middleware (or a shared requireAdmin wrapper) enforcing auth/roles at the edge for /admin and /api/admin/*, and remove the misleading session-refresh comment or implement it.

### 24. [MEDIUM/security] Admin promotion has no audit trail and single-tier gate `app/api/admin/users/route.ts`
toggle_admin lets any is_admin user grant or revoke admin on anyone else (only self-change is blocked). There is no audit log of who changed whom, no second-factor/confirmation, and no super-admin vs admin separation. A single compromised or rogue admin can silently promote alts and escalate across the platform, and there's no record to detect it.
**Recommendation:** Log all privilege changes (actor, target, timestamp) to an immutable audit table, require a higher role to grant admin, and surface the audit trail in the admin panel.

### 25. [MEDIUM/bug] Profile auto-created from Privy stores an uncapped, unsanitized display name `lib/auth/server.ts`
On first entrance, display_name is taken from Privy twitter name/username or email local-part with no length cap or trimming (onboard caps at 40 only when the user submits one, but this shell profile persists earlier and is used as the fallback in onboard: `body.display_name?.slice(0,40) || profile.display_name || handle`, so an overlong Privy name flows through uncapped). React escapes it on render so it's not XSS, but it can be arbitrarily long/garbage and is used in notifications and profile cards.
**Recommendation:** Sanitize and length-cap display_name at creation time, and cap the fallback in onboard too.

### 26. [LOW/performance] Like dedupe scheme creates high-cardinality ledger reasons and an extra query per like `app/api/social/route.ts`
To prevent unlike/relike minting, each like award uses reason=`liked_by_<uuid>` and every like does a points_ledger SELECT by that reason+ref before awarding. This bloats the reason column with unbounded distinct values (hard to index/aggregate for analytics or Season snapshots) and adds a round-trip on the hot like path.
**Recommendation:** Model likes as a first-class reactions row (already inserted) and derive/award via a UNIQUE(profile_id,subject) plus a stable reason like 'like'; check the reactions insert result instead of scanning the ledger.

### 27. [LOW/security] Follow action emits a notification on every (re)follow with no dedupe `app/api/social/route.ts`
On follow with on:true, if the follows insert succeeds a 'follow' notification is inserted. A user can unfollow/refollow (or, if the unique insert silently ignores, spam) to generate repeated follow notifications, an annoyance/harassment vector, and there's no rate limit. repost has a similar unbounded notification path.
**Recommendation:** Dedupe follow notifications (only notify on first-ever follow), and rate-limit follow/repost actions per actor.

### 28. [LOW/bug] Cron settles at most 100 matured Calls per hourly run, so backlogs never clear `app/api/cron/verdicts/route.ts`
The query limits to 100 oldest open Calls and the cron runs hourly (vercel.json). If more than 100 Calls mature within an hour (viral growth or a burst), settlements fall permanently behind and users see stale 'open' verdicts and delayed rewards.
**Recommendation:** Loop/paginate until no matured Calls remain per run (with a time budget), or shorten the schedule and raise the batch size; make settlement idempotent so overlap is safe.

### 29. [LOW/security] Token/watch/scrying/ledger proxy endpoints are unauthenticated and unthrottled `app/api/token/route.ts`
/api/token (GET q), /api/watch (GET address), /api/scrying (GET), and /api/ledger (GET address) proxy third-party APIs (DexScreener, GoPlus, Covalent/GoldRush with a server-side key) with no auth and no rate limiting. Anyone can use them as a free, key-bearing proxy, burning the GoldRush quota (real API key in /api/ledger) and the platform's rate budget, and enabling amplification/DoS against upstreams from the app's IP.
**Recommendation:** Require an authenticated session for these proxies (or at least an origin/rate-limit guard), cache aggressively, and never expose a keyed upstream (GoldRush) without a per-user quota.


## Tools: The Ledger, The Watch, The Scrying Glass, The Vault, The Forge, and token price card plumbing

### 1. [HIGH/bug] Watch treats missing GoPlus data as a pass, so unanalyzed tokens score 100 `app/api/watch/route.ts`
In app/api/watch/route.ts every check is a strict equality against "1" with the else branch emitting a pass (e.g. is_honeypot !== "1" renders "No honeypot detected"). GoPlus frequently returns records with fields absent or empty for new, non-tradable, or not-yet-simulated tokens. Such a token gets score 100, five green checks, and "Trade taxes within reason, Buy 0.0%, sell 0.0%" because Number(undefined ?? 0)*100 || 0 collapses missing tax data to 0. A safety tool that shows maximum confidence precisely when it has no data is worse than no tool.
**Recommendation:** Distinguish tri-state per field: pass only when the field is explicitly "0", risk on "1", and an "unknown" status (with a score haircut or an explicit "insufficient data" verdict) when the field is absent. Cap the top score when any field is unknown.

### 2. [HIGH/missing-feature] Approvals audit and one-tap revoke are absent though the brief calls them THE wedge `app/(shell)/watch/page.tsx`
THE RAVENSPIREFOUNDATION.md line 444-445 defines The Watch as scanning "tokens/contracts/approvals" with "one-tap APPROVAL REVOKE. THE wedge." and lists it as a LIVE pillar. The shipped page (app/(shell)/watch/page.tsx line 158-162) only scans a single token contract and openly defers approvals: "Approvals audit and one-tap revoke arrive as the Watch deepens." The differentiating feature of the flagship safety pillar is missing entirely; there is no wallet-approval enumeration anywhere in the codebase.
**Recommendation:** Add an approvals tab that takes the signed-in wallet (already available from useRealmAuth), enumerates ERC-20/NFT allowances (GoPlus approval_security endpoint or Alchemy/viem log scan of Approval events), flags risky spenders via GoPlus, and builds the revoke tx (approve(spender, 0)) through the Privy embedded wallet.

### 3. [HIGH/missing-feature] Watch uses only 6 GoPlus fields and ignores the dangerous ones `app/api/watch/route.ts`
app/api/watch/route.ts types GoPlusToken with just is_open_source, owner_change_balance, is_mintable, is_honeypot, buy_tax, sell_tax. GoPlus token_security also returns is_proxy, hidden_owner, can_take_back_ownership, selfdestruct, is_blacklisted, transfer_pausable, trading_cooldown, anti_whale, cannot_sell_all, slippage_modifiable, owner_percent, creator_percent, holder_count, lp_holders and LP-lock data. A token that is a pausable, blacklistable proxy with 90% creator supply and unlocked LP scores 100/100 here. That is a false clean bill on the most common rug patterns.
**Recommendation:** Score at minimum: proxy/hidden owner, blacklist, transfer_pausable, cannot_sell_all, selfdestruct, top-holder and creator concentration, and LP lock percentage. Group checks into Contract / Trading / Holders sections in the UI.

### 4. [HIGH/missing-feature] honeypot.is is never called even though the brief and .env.example specify it `app/api/watch/route.ts`
The brief (line 619) says "The Watch: GOPLUS_APP_KEY/SECRET (free) + honeypot.is (keyless)" and .env.example line 45 documents "honeypot.is is keyless, nothing needed". Grep across the repo shows zero references to honeypot.is outside .env.example. GoPlus is_honeypot alone has known false negatives on fresh tokens; honeypot.is runs an actual buy/sell simulation and returns simulated taxes and gas. The cross-check the founder specified is simply not there.
**Recommendation:** Call https://api.honeypot.is/v2/IsHoneypot?address=... in parallel with GoPlus, merge verdicts (either source flagging = risk), and surface simulated buy/sell taxes from the simulation rather than trusting GoPlus static values.

### 5. [HIGH/bug] GoPlus is called unauthenticated; GOPLUS_APP_KEY/SECRET exist in .env.example but are never read `app/api/watch/route.ts`
app/api/watch/route.ts fetches api.gopluslabs.io with no Authorization header and no signed token. Grep confirms GOPLUS_APP_KEY/GOPLUS_APP_SECRET appear only in .env.example. Unauthenticated GoPlus access is throttled per IP; since all users funnel through the same serverless egress IPs, a handful of scans (or one abusive client, see the no-rate-limit finding) exhausts the quota for everyone, and the route then returns the generic 502 "could not reach the wall" with no distinction from a real outage.
**Recommendation:** Implement the GoPlus access-token flow (SHA1(app_key+time+app_secret) against /api/v1/token) using the env vars already declared, cache the bearer token in memory, and surface a distinct "rate limited, retry in Ns" error to the client.

### 6. [HIGH/missing-feature] Ledger covers ETH mainnet only versus the brief's ETH + L2s (+ SOL/BNB) `app/api/ledger/route.ts`
app/api/ledger/route.ts line 33 hardcodes the eth-mainnet path of Covalent balances_v2. The brief (line 441) defines The Ledger as a "portfolio & PnL command center across ETH + L2s (+ SOL/BNB)". A Base- or Arbitrum-native user opens their Ledger and sees "This wallet holds no coin worth an entry yet" while holding a five-figure L2 portfolio, which reads as a data bug, not a scoping decision. GoldRush supports base-mainnet, arbitrum-mainnet, optimism-mainnet, bsc-mainnet, and solana-mainnet on the same endpoint shape.
**Recommendation:** Fan out over a chain list in parallel (Covalent even offers the multichain balances endpoint), tag each holding with its chain, and show a per-chain allocation breakdown.

### 7. [HIGH/missing-feature] Ledger has no PnL, cost basis, allocations, history, tax export, or public-positions opt-in `app/(shell)/ledger/page.tsx`
The brief (lines 441-443) promises "net worth, realized/unrealized PnL, cost basis, allocations, positions, history, tax/PnL export. Public positions opt-in feed your profile (creator flex)" and line 277 promises a WALLET CARD with "holdings + PnL (from The Ledger)". The shipped page (app/(shell)/ledger/page.tsx) is a single balances table with a total. No transaction history (Covalent transactions_v3 is on the same key), no PnL, no allocation chart, no export, and nothing feeding profiles.
**Recommendation:** Prioritize history + allocation donut next (both are single GoldRush calls), then 24h PnL from quote_24h which balances_v2 already returns and the route currently discards.

### 8. [HIGH/missing-feature] Scrying Glass whale/smart-money tracking, a LIVE pillar, is a static teaser card `app/(shell)/scrying/page.tsx`
The brief (lines 446-447) lists THE SCRYING GLASS as LIVE: "smart-money/whale intelligence: track top wallets/funds, real-time flows and positions, follow alpha". The shipped page (app/(shell)/scrying/page.tsx lines 85-98) renders a hardcoded "Track great wallets... This scrying deepens soon" card. There is no wallet tracking, no flows, no follow mechanism, and no data model for tracked wallets anywhere in the repo. One of the three launch pillars is effectively a Coming Soon page without the honest Coming Soon chip.
**Recommendation:** Ship a curated top-wallets list (seed 20-50 known smart-money addresses in Supabase), render each via the existing Ledger route, and add a follow button that raises notifications on large transfers via Alchemy webhooks. Failing that, label the pillar Coming Soon rather than implying it is live.

### 9. [HIGH/ux] Scrying presents paid DexScreener boosts as organic trending `app/api/scrying/route.ts`
app/api/scrying/route.ts sources its entire list from api.dexscreener.com/token-boosts/top/v1, which ranks tokens by how much promoters PAID for boosts, then the page titles it "What the realm is watching now, from live markets" (app/(shell)/scrying/page.tsx line 41). Boosted tokens skew heavily toward fresh low-liquidity meme launches and outright scams; the list name is even the promoter-written marketing description truncated to 60 chars (route line 34). A safety-first platform is relabeling paid promotion as organic market intelligence and deep-linking users to it, with no Watch risk badge on any row.
**Recommendation:** Switch to an organic source (DexScreener top volume/gainers search, GeckoTerminal trending pools, or Birdeye trending, all covered by the brief's key list), or clearly label rows as "Promoted", and run each address through the Watch scoring to show an inline defenses badge.

### 10. [MEDIUM/security] Watch chain parameter is unvalidated and interpolated into the upstream URL path `app/api/watch/route.ts`
app/api/watch/route.ts line 21 takes chain straight from the query string and concatenates it into the GoPlus path: token_security/${chain}?contract_addresses=... . The address is strictly regex-checked but chain is not, so /api/watch?address=0x..&chain=1%3Ffoo or chain=../other_endpoint lets a caller reshape the upstream request path and query on the GoPlus host through your server. The client only ever sends chain=1, so nothing legitimate needs the freedom.
**Recommendation:** Whitelist chain against a literal set of supported GoPlus chain IDs ("1","8453","42161","10","56", etc.) and reject anything else with 400.

### 11. [MEDIUM/missing-feature] Watch is hardcoded to Ethereum mainnet in the UI `app/(shell)/watch/page.tsx`
app/(shell)/watch/page.tsx line 44 appends chain=1 unconditionally and the helper text says "The Watch reads Ethereum contract addresses". The brief scopes the platform to ETH + L2s (+ SOL/BNB); the majority of new-token rug risk in 2026 lives on Base, BSC, and Solana, exactly where a safety scanner earns its keep. GoPlus supports all the EVM chains with the same endpoint, so this is a one-select-away gap.
**Recommendation:** Add a chain selector (ETH, Base, Arbitrum, Optimism, BSC) wired to the existing chain param, validated server-side per the previous finding. Solana can come later via GoPlus solana/token_security.

### 12. [MEDIUM/security] All four tool APIs are unauthenticated open proxies with zero rate limiting `app/api/ledger/route.ts`
/api/watch, /api/ledger, /api/scrying, and /api/token have no requireProfile call and no throttling of any kind (grep for rate limiting only hits app/api/raven/route.ts). /api/ledger is the worst: it accepts any address and relays it to Covalent with the paid GOLDRUSH_API_KEY, so anyone on the internet can use The Ravenspire as a free Covalent proxy and drain the key's quota; /api/watch similarly burns the shared GoPlus per-IP budget; /api/token relays arbitrary queries to DexScreener.
**Recommendation:** Require the Privy bearer token (requireProfile) on /api/ledger at minimum, and add a lightweight per-profile/per-IP token bucket (Upstash Ratelimit or a Supabase counter) on all four routes.

### 13. [MEDIUM/bug] Ledger does not filter Covalent spam tokens, so fake airdrops inflate net worth `app/api/ledger/route.ts`
app/api/ledger/route.ts keeps every item with quote > 0.5. Covalent balances_v2 is notorious for including scam airdrop tokens whose spoofed DEX pools produce large bogus quote values; the response has type/is_spam signals and a no-spam request flag, none of which are used. A user's "Net worth" headline (rendered gold, app/(shell)/ledger/page.tsx line 108) can show thousands of phantom dollars from a single spam token, and tapping nothing exposes the lie. In a product whose entire pitch is trust and safety, an inflated net worth is a credibility wound.
**Recommendation:** Request balances with the no-spam filter, additionally drop items where is_spam or type === "dust", and consider cross-checking outlier quotes against DexScreener liquidity before counting them in totalUsd.

### 14. [MEDIUM/polish] Scrying rows carry no price, change, volume, or symbol, and errors are indistinguishable from empty markets `app/(shell)/scrying/page.tsx`
Each trending row (app/(shell)/scrying/page.tsx lines 55-81) shows only a promoter description or shortened address plus a chain chip. A market-watch surface with no numbers reads as decorative. Additionally the API swallows every failure into { trending: [] } (route lines 25, 44), so the client shows "The glass is dark... No trends could be read" identically for a DexScreener outage and a genuinely empty list, and the page never retries.
**Recommendation:** Enrich each address with price/24h/liquidity via the batch tokens endpoint, show symbol prominently, and return a distinct error flag from the API so the UI can offer a retry.

### 15. [MEDIUM/performance] Token price cache is per serverless instance and grows without bound `lib/data/tokens.ts`
lib/data/tokens.ts holds cache and timestamps as module-level Maps with a 60s TTL but no eviction: entries are set and never deleted, and expired entries are kept forever as stale-on-error fallbacks. On Vercel each lambda instance has its own Map, so the TTL dedupe does not hold platform-wide: N warm instances make N upstream calls per query per minute, and cold starts wipe the stale-fallback benefit exactly when it is needed. Since every $cashtag in every rendered post triggers /api/token (components/social/price-card.tsx), an attacker or just a busy feed with many unique cashtags inflates both memory and DexScreener call volume until instances are recycled.
**Recommendation:** Bound the Map (LRU with a few hundred entries max), and move the shared cache to something cross-instance: rely on the Next data cache alone (the fetch already has revalidate: 60), or a Supabase/KV table keyed by query.

### 16. [MEDIUM/bug] Token lookup can render a confidently wrong token as the price card `lib/data/tokens.ts`
lib/data/tokens.ts line 48-53: the pair filter is symbol === q || q.length > 10, so any query longer than 10 chars skips symbol matching entirely and just takes the highest-liquidity pair from a fuzzy DexScreener search; and when no pair matches the symbol, the code falls back to pairs[0], DexScreener's arbitrary first result. A post containing $GOLDCOIN or a mistyped cashtag renders an authoritative gold-styled price card for a completely different token, with no hint of the mismatch. In a feed where Calls and Verdicts hang off these cards, wrong-token attribution is a correctness problem, not cosmetics.
**Recommendation:** For symbol queries, only accept exact case-insensitive symbol matches (drop the pairs[0] fallback and return null instead); reserve fuzzy behavior for 0x/full-address queries, which is what the q.length heuristic was presumably reaching for.

### 17. [MEDIUM/security] No liquidity floor on price cards lets zero-liquidity scam pairs get authoritative-looking prices `lib/data/tokens.ts`
lib/data/tokens.ts sorts by liquidity but never rejects low liquidity; a pair with $150 of liquidity yields a full glass price card with price, market cap (falling back to fdv, line 65, which wildly overstates unvested supply tokens), and 24h change. Scammers name tokens after trending symbols precisely to hijack cashtag lookups. Combined with the wrong-token fallback above, a $RAVEN cashtag today (pre-TGE, per the Vault page) resolves to whatever impostor token DexScreener finds.
**Recommendation:** Require a minimum liquidity (e.g. $10k) to render a card, visually mark FDV-derived caps as FDV, and hard-block known-impostor symbols like RAVEN until the real token exists.

### 18. [MEDIUM/missing-feature] Price card lacks the mini chart, and the Token card with Watch risk plus Wallet card are absent `components/social/price-card.tsx`
The brief specifies (lines 274-278) PRICE CARD: "price, market cap, 24h change, mini chart, chain"; TOKEN CARD with "a risk read from The Watch (rug/approval flags)"; and WALLET CARD with "holdings + PnL (from The Ledger), smart-money tag". components/social/price-card.tsx renders price/mcap/change/chain but no mini chart or volume, and no token-card or wallet-card component exists in components/social. The cross-pillar integration (Watch risk inline in the feed) is the brief's core differentiator for rich posts and none of it is wired, even though both backing APIs exist.
**Recommendation:** Add a sparkline (GeckoTerminal OHLCV is keyless), and when a card has an address, lazily fetch /api/watch to badge the card with the defenses score; a wallet card can reuse /api/ledger.

### 19. [MEDIUM/missing-feature] Vault Send is a placeholder and Receive has no QR code or chain warning `app/(shell)/vault/page.tsx`
app/(shell)/vault/page.tsx lines 217-228: Send is a static note ("Send opens with gasless smart accounts shortly"), so the wallet can receive funds users cannot move without exporting keys to another app, an ugly first-run trap for the email-onboarded normies the brief targets. Receive (lines 189-214) shows only a copyable text address: no QR code (standard for mobile transfers) and no statement of which network the address is for, inviting wrong-chain deposits. The page also renders the identical address block twice (Your address and Receive), spending screen space without adding capability.
**Recommendation:** Ship basic EOA send via Privy's sendTransaction now (gas paid normally) rather than waiting on 4337; add a QR (qrcode lib, rendered client-side) and an explicit "Ethereum & EVM networks" note; merge the duplicate address sections.

### 20. [MEDIUM/missing-feature] Forge has no Claim yield UI though the brief requires the full frontend at launch `app/(shell)/forge/page.tsx`
The brief (lines 450-452) demands the Forge frontend built at launch including "your position (staked / earned), and CLAIM yield", reiterated in FINALFOLLOWUP.md line 60 ("position + Claim"). app/(shell)/forge/page.tsx has hero, APR, stake form, and position tiles, but no Claim button or claim section anywhere. The founder asked for the complete staking surface now so only contract wiring remains later; a whole verb is missing.
**Recommendation:** Add a Claim section (claimable amount tile + Claim button, disabled while stoking) so the launch UI matches the contract interface that lands later.

### 21. [MEDIUM/bug] If the forge_staking flag flips on, the Forge becomes an enabled form that does nothing `app/(shell)/forge/page.tsx`
app/(shell)/forge/page.tsx line 151-157: the Swear an Oath button has disabled={stoking} but NO onClick handler, and the amount input (line 114-122) is free text with no numeric validation, no wallet-connection check, and no balance awareness. The flag is read client-side from the feature_flags table at mount, so the moment an admin enables forge_staking every user gets a live-looking gold button that silently swallows clicks, with the badge proudly claiming "Staking is live on-chain". Dead primary CTAs in a money flow torch trust.
**Recommendation:** Until contract wiring exists, have the enabled-state button open an honest "connect wallet / final wiring in progress" modal, validate amount as a positive decimal, and gate the flag flip on the tx path actually existing.

### 22. [MEDIUM/bug] A duplicate legacy route tree serves placeholder pages at /app/ledger, /app/watch, etc. `app/(shell)/app/(shell)/ledger/page.tsx`
There is a second nested tree at app/(shell)/app/(shell)/ containing 20 pages (ledger, watch, scrying, vault, forge, ...) that each render SectionPlaceholder. Because the inner "app" directory is a literal path segment, these all resolve as real routes: /app/ledger shows a placeholder while the real Ledger lives at /ledger. Anyone hitting an old link, a crawler, or a mistyped URL lands on a ghost version of the product; it also doubles the route surface and invites future edits to the wrong file.
**Recommendation:** Delete the app/(shell)/app directory outright, or replace it with redirects to the canonical paths in next.config.

### 23. [LOW/security] GoldRush API key travels in the URL query string `app/api/ledger/route.ts`
app/api/ledger/route.ts line 33 appends ?key=${key} to the Covalent URL. Keys in URLs leak into proxy logs, upstream access logs, and any error monitoring that captures request URLs; the full URL (including the key) also becomes the Next.js data-cache key via the revalidate option. Covalent supports Basic/Bearer header auth for exactly this reason.
**Recommendation:** Send the key as an Authorization header (Basic base64(key+":") or Bearer) and keep the cache key clean.

### 24. [LOW/ux] Ledger silently drops sub-$0.50 holdings and has no refresh affordance `app/(shell)/ledger/page.tsx`
The quote > 0.5 filter (app/api/ledger/route.ts line 44) means a wallet holding only dust renders "This wallet holds no coin worth an entry yet", which is factually wrong and confusing for a new user who just received their first small transfer. Separately, the page fetches once on mount (app/(shell)/ledger/page.tsx useEffect) and both error branches say "Try again shortly" with no retry button and no way to refetch short of a full reload.
**Recommendation:** Show dust collapsed under an expandable "small balances" row, and add a retry button plus a last-updated timestamp with manual refresh.

### 25. [LOW/bug] formatBalance loses precision on large raw balances via Number() `app/api/ledger/route.ts`
app/api/ledger/route.ts line 13 converts the raw uint256 balance string with Number(raw), which is lossy above 2^53. For high-supply meme tokens (quadrillions of units at 18 decimals) the displayed balance drifts from the true value. Display-only today, but if this helper is ever reused for send amounts or PnL math the drift becomes a correctness bug.
**Recommendation:** Convert with BigInt division for the integer part and only use floating point for the fractional remainder (or use viem's formatUnits).

### 26. [LOW/bug] Scrying fires a second DexScreener search whose result is never used `app/api/scrying/route.ts`
app/api/scrying/route.ts lines 16-24: Promise.all launches fetch("https://api.dexscreener.com/latest/dex/search?q=ETH") alongside the boosts call, but only boostsRes is destructured; the search response is never read. Every cache-miss request to /api/scrying spends an extra upstream call and adds latency (Promise.all waits for both) for nothing, needlessly nibbling at DexScreener's 300 req/min rate limit that /api/token also depends on.
**Recommendation:** Delete the dead fetch, or actually use it to enrich rows with price and 24h change data.

### 27. [LOW/ux] Vault copy button fails silently when the clipboard API is unavailable `app/(shell)/vault/page.tsx`
app/(shell)/vault/page.tsx lines 12-20: on navigator.clipboard failure the catch does nothing, so the button never flips to Copied and gives no feedback. Clipboard writes fail routinely in non-secure contexts and some in-app webviews (exactly where an X-login audience lives). A user who thinks they copied their deposit address and pastes something stale can misdirect funds.
**Recommendation:** On failure, fall back to a select-all of the code element or show a "Copy failed, long-press to copy" hint instead of staying quiet.

### 28. [LOW/security] Raven rate limit is per-instance memory, so limits multiply and reset with scaling `app/api/raven/route.ts`
app/api/raven/route.ts lines 6-8 keep the 20-per-hour usage Map in module scope. Each warm lambda instance has its own Map, so a user's effective cap is 20 x instance-count, and every cold start resets counters. The code comment admits it is per-instance, but since this guards real Anthropic spend and the tool routes have no limits at all, the platform's only rate limiter is largely decorative under load.
**Recommendation:** Back the counter with Supabase (an upsert-and-count on a usage table keyed by profile+hour) or Upstash Ratelimit, shared across instances, and reuse the same helper for the tool APIs.

### 29. [LOW/ux] Watch reports one generic failure message for rate limits, outages, and pending scans `app/api/watch/route.ts`
app/api/watch/route.ts returns "The Watch could not reach the wall" for any non-ok upstream status and any thrown error, and "No report for this contract" when result is empty. GoPlus returns an empty result with a pending/async status code when a token has not been indexed yet, meaning users scanning a brand-new token (the highest-risk moment) get a dead-end 404 rather than "scan in progress, retry in a moment". There is also no per-check chain/explorer link to verify findings.
**Recommendation:** Inspect GoPlus's code field to distinguish pending (prompt a retry with backoff), rate-limited, and not-found; link the address to Etherscan on the results screen.

### 30. [LOW/polish] Honeypot verdict only drops the score to 30; a confirmed honeypot should floor near zero `app/api/watch/route.ts`
In app/api/watch/route.ts a token flagged is_honeypot with everything else clean scores 100-70=30, rendered in ember color as a middling number. A confirmed honeypot is a 0-or-near-0 situation, full stop; presenting 30/100 invites "risky but maybe" reads. The additive-penalty model treats independent fatal findings as fractional deductions.
**Recommendation:** Make fatal findings (honeypot, owner_change_balance, cannot_sell_all) cap the score at <=5 regardless of other passes, and render a plain-language "DO NOT BUY" verdict banner.

### 31. [IDEA/idea] Auto-badge every address surfaced anywhere with a Watch defenses score `app/(shell)/scrying/page.tsx`
The three pillars currently do not talk to each other: Scrying rows, price cards, and Ledger holdings all carry addresses, and the Watch scoring endpoint already exists and is cache-friendly (revalidate 120). The brief's whole thesis is safety woven through the social layer (line 276: token card with "a risk read from The Watch").
**Recommendation:** Create a tiny WatchBadge component that lazily fetches /api/watch for any address and renders the score as a colored shield chip; drop it into Scrying rows, price cards, and Ledger table rows. This converts three siloed tools into the integrated safety fabric the brief sells, at near-zero backend cost.

### 32. [IDEA/idea] Persist Watch scans as shareable posts to feed the social loop `app/(shell)/watch/page.tsx`
Watch results are ephemeral client state today (app/(shell)/watch/page.tsx). Scans are exactly the kind of high-signal content the feed wants: "The Watch judged $TOKEN: 22/100, owner can mint, LP unlocked."
**Recommendation:** Add a "Post this scan" button that creates a post with an embedded scan card (score + top 3 findings + address), earning points per the engagement ledger. It markets the wedge feature with every share and gives Calls an objective safety companion.

### 33. [IDEA/idea] Seed the Scrying Glass with a hand-curated smart-money roster to ship the pillar honestly `app/(shell)/scrying/page.tsx`
Whale tracking feels blocked on infrastructure, but a v1 needs only a Supabase table of 30 known wallets (funds, famous traders) with labels, each rendered through the existing /api/ledger route, plus a follow toggle. Real-time flows can come later via Alchemy address-activity webhooks feeding the existing notifications system.
**Recommendation:** Ship the curated roster + holdings view in days using code that already exists, replacing the "deepens soon" card and making the third LIVE pillar genuinely live.


## Admin panel (app/admin/*, app/api/admin/*) vs brief 8C and FINALFOLLOWUP item 7

### 1. [CRITICAL/missing-feature] Reports can never be filed: no user-facing report flow and no INSERT path to the reports table `app/api/admin/reports/route.ts`
The moderation queue at app/admin/moderation/page.tsx and app/api/admin/reports/route.ts only reads and updates the reports table. A grep across app/ and components/ finds zero report buttons, zero report submission routes, and zero inserts into reports. Live DB confirms: reports has RLS enabled with NO policies at all (pg_policies returns nothing for it), so even a direct anon client insert would fail. The entire moderation pipeline the brief demands (moderate content + reports, Reports nav section) is a dead end that will sit at 0 rows forever.
**Recommendation:** Add a POST /api/reports route (requireProfile + service role insert) and a Report action on posts/comments/profiles in the client, then the admin queue becomes real.

### 2. [CRITICAL/missing-feature] No ban or verify user controls anywhere, despite explicit brief requirement `app/api/admin/users/route.ts`
Brief 8C: Controls: verify/ban users. app/api/admin/users/route.ts supports exactly one action, toggle_admin. The live profiles table has no banned, suspended, or verified column (confirmed via information_schema), and requireProfile in lib/auth/server.ts enforces no ban state, so even a manual DB flag would do nothing. A spammer or scammer cannot be removed from the realm by any means the product offers.
**Recommendation:** Add is_banned and is_verified columns, enforce is_banned in requireProfile (return 403) and in feed queries, and add Ban/Unban and Verify actions to the admin users API and page.

### 3. [HIGH/missing-feature] Moderation has no content takedown: resolving a report does nothing to the offending content `app/api/admin/reports/route.ts`
app/api/admin/reports/route.ts only flips reports.status to resolved or dismissed. Posts have a soft-delete deleted column (used by lib/social/queries.ts and app/api/cron/verdicts/route.ts), but no admin route can set it, and app/api/posts has no DELETE handler at all. Brief 8C requires moderate content, not just close tickets. An admin who confirms abuse literally cannot remove the post.
**Recommendation:** Add a takedown action (set posts.deleted = true via service role) to the reports POST handler, plus a content browser tab in Moderation to search and remove posts directly.

### 4. [HIGH/security] Zero audit logging of admin actions `app/api/admin/users/route.ts`
Granting/revoking admin seats (app/api/admin/users/route.ts), toggling feature flags (app/api/admin/flags/route.ts), and resolving reports (app/api/admin/reports/route.ts) write nothing about who acted or when. The live DB has no audit_log table, and reports has no resolved_by/resolved_at columns (confirmed via information_schema). If an admin account is compromised or a rogue steward mass-grants seats, there is no trail at all.
**Recommendation:** Create an admin_audit_log table (actor_id, action, target, payload, created_at) and insert a row in every admin POST handler; surface the log on the Overview page.

### 5. [HIGH/security] profiles table is fully public-readable, exposing privy_id, wallet_address, and the complete admin roster `lib/supabase/admin.ts`
pg_policies on the live ravenspire project shows profiles has a public read SELECT policy with qual true and no column restrictions. Any anonymous visitor with the anon key can enumerate every profile including privy_id, wallet_address, settings, and is_admin. That last one hands attackers a precise target list of admin accounts to phish or credential-stuff, directly undermining the admin panel's gate.
**Recommendation:** Replace the blanket policy with a column-safe public view (handle, display_name, avatar, house, renown) and restrict privy_id, wallet_address, settings, and is_admin to the owner and service role.

### 6. [HIGH/missing-feature] Overview is missing half the brief's stat cards and all charts `app/api/admin/overview/route.ts`
Brief 8C: stat cards (Users, DAU, Posts, Glory issued, Live rooms, Revenue) + charts + recent activity/reports table. app/api/admin/overview/route.ts returns only users, posts, openReports, gloryIssued. There is no DAU, no Live rooms (the rooms table and /api/rooms exist, so it is computable), no Revenue (a tips table exists), no charts of any kind anywhere in app/admin, and the recent table shows only posts, not reports or activity.
**Recommendation:** Add DAU (distinct actors in points_ledger or post_views over 24h), live rooms count (rooms.status), revenue (sum of tips), plus 7-day signups/posts sparkline charts and a merged recent activity + open reports table.

### 7. [HIGH/missing-feature] Seasons page is read-only; season creation, editing, and settlement writes are absent `app/admin/seasons/page.tsx`
app/admin/seasons/page.tsx renders seasons rows and openly says Season creation and settlement controls arrive with the next wave. There is no /api/admin/seasons route at all. Brief 8C requires manage Houses/Seasons and the follow-up item 7 repeats manage seasons. Nobody can start Season 2, adjust vault_raven, extend an end date, or close the season and trigger the points-to-RAVEN conversion the product promises.
**Recommendation:** Add POST /api/admin/seasons with create, edit dates/vault, activate, and close+settle actions, and wire form controls into the page.

### 8. [HIGH/missing-feature] The War admin page shows hardcoded client data instead of the live war tables, violating the real data only rule `app/admin/war/page.tsx`
app/admin/war/page.tsx imports champions from lib/game/champions (a static TS file) and computes roster counts and unlocked at the start from it, while the live DB has war_state and war_battles tables it never touches. Brief 8C requires manage War content (champions, weapons, unlocks) and real data only. There is no /api/admin/war route, no battle log viewer, no balance levers, no unlock toggles. The page even admits the council does not yet have a viewing table.
**Recommendation:** Move champion/weapon/unlock definitions into DB tables (or an admin-editable config table), build /api/admin/war for roster edits and unlock toggles, and add a war_battles viewer with filters.

### 9. [HIGH/missing-feature] Crests page has no configuration: no issuance, revocation, or rewards, and no holder data `app/admin/crests/page.tsx`
app/admin/crests/page.tsx renders the static crests array from components/brand/crests.tsx and states Issuance and revocation controls arrive with the next wave. The live user_crests table (which tracks actual holders) is never queried, so admins cannot see how many members hold each crest, cannot grant or revoke one, and cannot configure crest rewards. Brief 8C: configure crests + rewards.
**Recommendation:** Join user_crests for per-crest holder counts, and add grant/revoke endpoints plus live/locked status and reward configuration stored in a crests DB table instead of a hardcoded array.

### 10. [HIGH/missing-feature] Admin nav is missing the Reports and Settings sections the brief lists explicitly `app/admin/layout.tsx`
Both briefs enumerate the left nav: Overview, Users, Moderation (Content/Moderation), Houses, Seasons, Crests, The War, Reports, Feature Flags, Settings. app/admin/layout.tsx navItems has only 8 entries; Reports (report history/analytics separate from the live moderation queue) and Settings (platform-level config) do not exist as pages or routes. The admin reports API also filters to status=open only, so resolved/dismissed history is unreachable even via API.
**Recommendation:** Add /admin/reports (full history with status filter, add a status query param to the GET) and /admin/settings (platform config, cron status, season defaults).

### 11. [HIGH/ux] Moderation queue shows a truncated subject_id but no way to view the reported content `app/admin/moderation/page.tsx`
app/admin/moderation/page.tsx renders subject_type plus r.subject_id.slice(0, 8) and nothing else about the subject. An admin deciding Resolve vs Dismiss cannot see the post body, the comment, or the reported profile without manually querying the database. This makes the entire judgment flow unusable in practice.
**Recommendation:** Have the reports GET hydrate the subject (join posts/comments/profiles by subject_type) and render a content preview plus a link to the live post/profile in a new tab.

### 12. [MEDIUM/bug] Glory issued stat undercounts: it sums house glory and ignores glory earned by unsworn members `app/api/admin/overview/route.ts`
app/api/admin/overview/route.ts computes gloryIssued by summing houses.glory. But lib/points.ts award() always adds glory to profiles.glory and only mirrors it to the house when prof.house_slug is set (line 57: if (glory > 0 && prof.house_slug)). Every point of glory earned by users who have not yet sworn to a house is invisible in the admin stat, so the number labeled Glory issued is wrong whenever unsworn users play.
**Recommendation:** Sum profiles.glory (or points_ledger.glory_delta) for the issued total; keep the house sum as a separate House glory stat.

### 13. [MEDIUM/bug] Overview post count and Recent ravens include soft-deleted posts `app/api/admin/overview/route.ts`
Feed queries in lib/social/queries.ts filter .eq("deleted", false), but app/api/admin/overview/route.ts counts posts and lists the 8 most recent without any deleted filter. Once takedowns exist (or authors delete), the admin stat will diverge from reality and removed content resurfaces in the Recent ravens table with no indication it is deleted.
**Recommendation:** Either filter deleted=false, or better for admins: include deleted posts but select the deleted flag and badge them Removed in the table.

### 14. [MEDIUM/missing-feature] Four of five feature flags are dead switches: nothing in the codebase reads them `app/admin/flags/page.tsx`
The live feature_flags table holds claim_window, forge_staking, rookery_live, tips, war_pvp. Grepping the repo, only forge_staking is ever consumed (app/(shell)/forge/page.tsx line 30). Toggling rookery_live, tips, war_pvp, or claim_window in /admin/flags changes nothing anywhere; /api/rooms, the tips table, and the war routes never check them. The brief's toggle features (Coming Soon flags) promise is an illusion for 4 of 5 levers, and the Coming Soon nav itself is hardcoded in lib/nav.ts.
**Recommendation:** Wire each flag into its feature's server routes (reject when off) and client gates, and mark unconsumed flags in the admin UI so stewards know what a lever actually controls.

### 15. [MEDIUM/security] Admin seat granting is a single unconfirmed click with toggle semantics that can race `app/api/admin/users/route.ts`
app/admin/users/page.tsx fires toggle_admin from a one-click table button with no confirmation dialog. The API (app/api/admin/users/route.ts) reads is_admin then writes the negation, a non-atomic read-modify-write: a double click that slips past the busyId guard, a retried request, or two admins acting concurrently flips the value twice and silently reverts the intended change. Combined with no audit log, an accidental grant of full admin power is both easy and untraceable.
**Recommendation:** Change the API to explicit grant_admin/revoke_admin actions with the expected current value, and add a confirm dialog naming the user before granting a seat.

### 16. [MEDIUM/bug] Houses and Seasons admin pages swallow query errors and show a misleading empty state `app/admin/seasons/page.tsx`
app/admin/houses/page.tsx and app/admin/seasons/page.tsx call the anon Supabase client and destructure only { data } in .then, ignoring error. On a network failure or an RLS change, rows stays [] and the page confidently renders No seasons are written in the calendar yet or the heralds have not posted the house rolls, telling an admin the realm is empty when the read actually failed. Every other admin page distinguishes error from empty.
**Recommendation:** Capture the error and render the same error state pattern used by the Overview/Users pages; ideally route these reads through /api/admin/* like the rest of the panel.

### 17. [MEDIUM/missing-feature] Users page caps at the 50 newest with no search, pagination, or filters `app/admin/users/page.tsx`
app/api/admin/users/route.ts hardcodes .limit(50) ordered by created_at desc, and app/admin/users/page.tsx has no search box, no pagination, no house/tier filter. The page literally subtitles itself The fifty newest members of the realm. User 51 onward is unreachable from the admin panel; finding a specific reported user by handle is impossible. This fails the manage users requirement at any real scale.
**Recommendation:** Add ?q= (ilike on handle/display_name), ?cursor= pagination, and sort/filter params to the API, with a search input and Load more in the UI.

### 18. [MEDIUM/security] Admin gate is client-side only; the admin shell ships to and renders for any signed-in user until an async check completes `app/admin/layout.tsx`
app/admin/layout.tsx is a use client component that gates via a /api/me fetch after mount; there is no middleware.ts (confirmed absent) and no server-side check on the /admin segment. Data APIs are individually protected, so leakage is limited, but the whole admin UI bundle, nav structure, and page code are delivered to every visitor, and houses/seasons pages fetch via the anon key rather than the guarded APIs. Defense-in-depth for a panel that grants admin seats should not rest on one client-side useEffect.
**Recommendation:** Add middleware or a server layout that verifies the Privy token and is_admin before rendering /admin, keeping the client check as a fallback.

### 19. [MEDIUM/missing-feature] Houses page is observe-only: no house management despite brief requirement `app/admin/houses/page.tsx`
app/admin/houses/page.tsx states House management controls arrive with the next wave. For now the council may observe, not intervene. There is no /api/admin/houses route. Brief 8C requires manage Houses: renaming, adjusting glory (e.g. reverting exploited glory), opening/closing enrollment, or seeding a new house are all impossible.
**Recommendation:** Add an admin houses API with edit name/motto, glory adjustment (with reason, written to points_ledger and the audit log), and membership tools.

### 20. [MEDIUM/missing-feature] Feature flags cannot be created or annotated from the panel `app/api/admin/flags/route.ts`
app/api/admin/flags/route.ts POST only updates existing rows (update ... maybeSingle, 404 on miss) and only the enabled field; note is read-only in the UI. Registering a new flag for a rollout requires direct DB access, which contradicts a clean and complete admin panel and guarantees drift between code-referenced keys and DB rows (a typo'd key in code silently reads as off with no way to see it).
**Recommendation:** Support upsert with key validation and note editing, and show a warning row for flags referenced in code but missing from the table.

### 21. [MEDIUM/ux] Report judgments record no outcome metadata, making the Reports history section impossible to build well later `app/api/admin/reports/route.ts`
The reports table has only id, reporter_id, subject_type, subject_id, reason, status, created_at (confirmed via information_schema). Resolve/dismiss in app/api/admin/reports/route.ts stores neither who judged, when, nor a resolution note. When the brief's Reports section is added, it will show status changes with no accountability or context, and duplicate reports against the same subject are not grouped or deduplicated.
**Recommendation:** Add resolved_by, resolved_at, and resolution_note columns, populate them in the POST handler, and group open reports by subject with a count.

### 22. [LOW/bug] Any legitimate admin sees the sealed sign-in screen on a transient /api/me failure `app/admin/layout.tsx`
app/admin/layout.tsx sets gate to sealed whenever realmFetch("/api/me") is not ok, including a 503 from a missing service role key, a network blip, or a Privy token refresh hiccup. The SealedChamber copy then tells an actual admin they lack a seat and offers a Sign in button, with no retry and no distinction between not authorized and check failed.
**Recommendation:** Branch on status: 401/403 renders sealed; 5xx/network renders an error state with a Retry button.

### 23. [LOW/security] Every admin API check runs requireProfile, which creates a profile row as a side effect `lib/auth/server.ts`
lib/auth/server.ts requireProfile inserts a new profiles row (with Privy enrichment calls) for any valid token without an existing profile. Hitting GET /api/admin/overview or the layout's /api/me with a fresh Privy account therefore writes to the database and calls privy.getUser before the 403 is returned. Probing the admin surface should be a pure read; this also lets scripted signups mint profile rows through admin endpoints.
**Recommendation:** Split a read-only getProfile (no insert) for authorization checks; keep profile creation in the onboarding path only.

### 24. [LOW/polish] Admin pages have no document titles or metadata `app/admin/layout.tsx`
All pages under app/admin are use client components with no exported metadata and no sibling layout metadata, so every admin tab shows the site-wide default title. With eight sections open in tabs (Users, Moderation, Flags...), stewards cannot tell tabs apart, and the panel feels less finished than the dark, premium admin dashboard the brief describes.
**Recommendation:** Add a server layout or per-route layout.tsx files exporting metadata (THE RAVENSPIRE Admin: Users, etc.).

### 25. [LOW/ux] Moderation and users tables lose all rows behind a spinnerless pulse and act destructively without undo `app/admin/moderation/page.tsx`
In app/admin/moderation/page.tsx, acting on a report immediately filters it out of local state on success; a misclicked Dismiss vanishes with no undo and no way to reopen (the API only transitions open reports, so a mistake is final). Buttons show Resolve/Dismiss with only a disabled state while busy, and the note error line is easy to miss above the table.
**Recommendation:** Add a brief undo toast (reopen action in the API), or an inline confirmed state before removal from the list.

### 26. [IDEA/idea] Compute Revenue and Live rooms stats from tables that already exist `app/api/admin/overview/route.ts`
The live schema already has tips (tipping revenue) and rooms/room_participants (live courts). The brief's Revenue and Live rooms stat cards are therefore cheap to deliver honestly: sum tips over a period and count rooms in a live status, plus concurrent participants. This closes two brief gaps with no schema work.
**Recommendation:** Extend the overview route with tips sum (24h/7d/all) and live room + participant counts, and add the two cards to the Overview grid.

### 27. [IDEA/idea] DAU and engagement charts from points_ledger with zero new instrumentation `app/api/admin/overview/route.ts`
points_ledger records every rewarded action with profile_id and timestamps, and post_views tracks reads. Distinct profile_id per day over these tables gives real DAU/WAU and a 30-day engagement chart, satisfying the brief's DAU card and charts requirement with data already being written.
**Recommendation:** Add a SQL RPC (group by day, count distinct) and render a small sparkline chart component on the Overview; reuse it for posts/day and signups/day.

### 28. [IDEA/idea] User detail drawer: one click from the users table to a full dossier `app/admin/users/page.tsx`
Admins will constantly pivot from a report or stat to a specific user. A drawer on app/admin/users/page.tsx showing profile fields, points_ledger history, recent posts, referrals, crests held, reports filed by and against them, with ban/verify/adjust-glory actions inline, would make the panel genuinely operational instead of a read-only census.
**Recommendation:** Build GET /api/admin/users/[id] aggregating those tables and a slide-over drawer with the action buttons.

### 29. [IDEA/idea] Season close ceremony: a guarded settlement wizard for the vault payout `app/admin/seasons/page.tsx`
The seasons table carries vault_raven and the product promises points convert to $RAVEN at season end, with a claim_window flag already seeded. A Close Season wizard (preview payout distribution by points, require typed confirmation, write to points_ledger, flip claim_window on, audit-log everything) would be the highest-leverage admin feature for launch operations and directly implements two brief items at once.
**Recommendation:** Implement as a multi-step server action with a dry-run preview endpoint before any write.


## UX, brand, responsiveness, motion

### 1. [HIGH/bug] Stale duplicated route tree ships 20 placeholder pages at /app/* `app/(shell)/app/(shell)/home/page.tsx`
A leftover directory app/(shell)/app/(shell)/ contains 20 old placeholder pages (home, war, throne, vault, settings, etc), all rendering SectionPlaceholder with 'The builders are at work on this hall.' These are publicly reachable at /app/home, /app/war and so on, duplicating every real route with an off-brand stub and polluting routing and SEO. Verified: every SectionPlaceholder usage in the codebase lives only in this stale tree.
**Recommendation:** Delete the entire app/(shell)/app directory. Add a build check or route test that fails if SectionPlaceholder is reachable from any route.

### 2. [HIGH/bug] SVG gradient ids from module-level counters cause hydration mismatches and can break the forged-gold fill `components/brand/raven-mark.tsx`
RavenMark uses `const id = \`rv-gold-${gradientSeq++}\`` and CrestRoundel uses `crest-gold-${seq++}` (components/brand/crests.tsx line 87). The counter advances independently on server and client and on every re-render, so ids differ between SSR HTML and hydration, producing React hydration warnings and, when defs and url(#id) references drift apart (10 crests render on the landing hero), a raven mark or crest whose stroke/fill silently resolves to nothing. The brand's centerpiece gold gradient is the thing at risk.
**Recommendation:** Replace both counters with React's useId(), or a single shared <defs> gradient with a fixed id rendered once (e.g. in the root layout) that all marks reference.

### 3. [HIGH/bug] Side nav profile card is hardcoded: signed-in users still see a Sign in button and no identity `components/shell/side-nav.tsx`
Lines 66-92 render a static card: generic user icon, 'Your Keep', 'Enter the realm', a gold 'Sign in' button, and a '$RAVEN' pill with no balance. SideNav never calls useRealmAuth, so an authenticated creator sees a Sign in CTA forever. Brief section 9 requires the side nav top to be a profile card with avatar, @handle, Standing tier, and the $RAVEN balance pill.
**Recommendation:** Wire the card to useRealmAuth plus /api/me: show avatar, @handle, tier, and real balance when authenticated; show the Sign in state only for anonymous visitors.

### 4. [HIGH/ux] Notifications (Ravens) are unreachable on desktop `components/shell/side-nav.tsx`
The only links to /ravens are the bell in TopBar, which is lg:hidden (components/shell/top-bar.tsx line 16). socialNav in lib/nav.ts has no Ravens entry and RightRail has no bell. A desktop user has no way to open notifications at all, for a social platform where call verdicts, mentions and House invites are core loops.
**Recommendation:** Add Ravens (Notifications) to the side nav social group with an unread count badge, or put a bell in the desktop right rail header.

### 5. [HIGH/bug] Floating 'Send a raven' FAB navigates to /home?compose=1 but nothing reads the compose param `app/(shell)/layout.tsx`
Line 23 links the gold FAB to /home?compose=1. No component reads that param (grep confirms: only unrelated composeOpen state in whispers/throne). On /home the FAB does nothing perceptible; on other pages it just navigates home without opening or focusing the composer. On mobile the composer sits above the fold behind the tour mount, so the primary create action is effectively dead.
**Recommendation:** Read the param (useSearchParams) in Feed/Composer to focus the textarea and scroll it into view, or make the FAB open a compose sheet directly.

### 6. [HIGH/ux] Touch targets widely below the 44px the brief mandates `components/shell/top-bar.tsx`
Brief section 4 requires touch targets >=44px. TopBar bell/whispers/vault buttons are h-9 w-9 (36px, lines 28-48). PostCard action buttons (like, repost, bookmark, share) are px-2 py-1 with 16px icons, roughly 26px tall (components/social/post-card.tsx lines 82-97). The feed filter button is explicitly 30px (h-[30px] w-[30px], components/social/feed.tsx line 116). Bottom nav labels at 10px with 21px icons are also tight.
**Recommendation:** Give all icon-only controls a min 44x44 hit area (min-h-11 min-w-11 or padding), keeping visual size smaller if desired.

### 7. [MEDIUM/missing-feature] framer-motion is absent from every in-app page, against the brief's motion spec `app/(shell)/home/page.tsx`
Grep shows framer-motion imported only in app/page.tsx (landing), app/signin/page.tsx, app/welcome/page.tsx and components/onboarding/tour.tsx. The entire shell (feed, post cards, war, throne, vault, whispers, drawers, filter popover, tabs) has zero animation beyond CSS hover transitions. Brief section 3 requires 'MOTION: cinematic but fast (framer-motion), scroll reveals' and the UX principle demands 'buttery motion' beating The Arena. New posts pop in, tabs hard-swap, popovers appear instantly.
**Recommendation:** Add AnimatePresence/motion primitives for feed item entrance, tab underline transitions, drawer/popover spring animations, and count tick animations, all gated by useReducedMotion.

### 8. [MEDIUM/bug] Undefined class scrollbar-none used on the feed tab row `components/social/feed.tsx`
Line 100 uses className="scrollbar-none ..." but no such utility exists in globals.css and Tailwind v4 ships no scrollbar-none. The horizontally scrolling tab strip therefore shows a scrollbar on overflow (visible on mobile widths where five tabs plus pr-10 overflow), which is exactly the kind of un-premium detail the brand brief bans.
**Recommendation:** Define .scrollbar-none { scrollbar-width: none } plus ::-webkit-scrollbar { display: none } in globals.css, or use a masked overflow container.

### 9. [MEDIUM/ux] Mobile drawer has no animation, no focus trap, no Escape, and a misleading trigger icon `components/shell/top-bar.tsx`
The drawer (lines 52-63) mounts instantly with no enter/exit motion, in a product whose brief demands buttery motion. It has no focus trap or Escape handling, so keyboard users tab into content behind the overlay. The trigger uses the 'user' icon with aria-label 'Open menu' (lines 17-23), which visually reads as a profile button, not the navigation drawer.
**Recommendation:** Animate the drawer with framer-motion (slide plus fade, respecting reduced motion), trap focus while open, close on Escape, and use a menu/sigil glyph or the user's real avatar consistently with what it opens.

### 10. [MEDIUM/missing-feature] Plain-English descriptors are hover-only in the side nav, invisible on touch devices `components/shell/side-nav.tsx`
Line 40: the plain descriptor uses 'hidden ... group-hover:inline', so 'The Crossroads (Explore)', 'The Rookery (Live)' etc show their meaning only on mouse hover. The mobile drawer is the same component, and touch has no hover, so new mobile users see only cryptic themed names. The brief's naming principle says every themed name is ALWAYS paired with a plain descriptor so the user never guesses.
**Recommendation:** Show the plain word persistently (small muted text right-aligned or under the themed name) instead of gating it behind hover.

### 11. [MEDIUM/missing-feature] Landing page misses brief 8B sections: no Chapters roadmap, no Seasons/points section, no socials `app/page.tsx`
Brief 8B specifies the scroll story: what it is -> social/creators -> Claim the Throne -> @raven -> $RAVEN + create-to-earn -> Seasons/points -> the Chapters roadmap -> CTA -> trust + socials. The page has five cards and a CTA but no Chapters roadmap section (The Mint, Prophecies, The Raven Unbound, The Long Night exist in nav but are never marketed on landing), no dedicated Seasons section, and the footer (lines 220-223) has zero social links. The crest field also lacks the specified parallax energy (pure CSS loop, no pointer/scroll parallax).
**Recommendation:** Add a Chapters roadmap section reusing comingSoonNav blurbs with chapter chips, a Seasons band, and X/Telegram/docs links in the trust footer; consider subtle scroll-linked parallax on the crest field.

### 12. [MEDIUM/ux] No toast/error surface anywhere: social actions fail silently and Copy link gives no feedback `components/social/post-card.tsx`
There is no toast system in the codebase (grep for toast/sonner returns nothing). toggleLike/doRepost/toggleBookmark (lines 115-142) update optimistically and ignore the realmFetch result entirely, so a failed like stays visually liked with the count wrong until reload. share() (lines 143-150) copies a link with zero confirmation, and its catch comment is literally 'no clipboard, no drama'. Errors elsewhere are inline-only (composer) or absent.
**Recommendation:** Add a small branded toast layer (glass chip, gold hairline) for confirmations and failures, and roll back optimistic state when the API call fails.

### 13. [MEDIUM/bug] Like/repost/bookmark state never hydrated from the server, so it resets on every reload `components/social/post-card.tsx`
Lines 101-105 initialize liked/reposted/bookmarked to false regardless of viewer state; the Post type is not queried with viewer_liked style fields. A user who liked a post sees it unliked after refresh and can 'like' it again, visually double counting and making the bookmark page inconsistent with card state.
**Recommendation:** Return viewer_liked/viewer_reposted/viewer_bookmarked from the feed query for the authenticated user and seed the card state from them.

### 14. [MEDIUM/missing-feature] No >1440 wide layout: content capped at 672px with empty gutters, violating the brief's wide-breakpoint rule `app/(shell)/layout.tsx`
Brief section 4: 'Wide (>1440) uses extra space for more columns, never empty gutters.' Grep finds zero 2xl: or min-[1440px] usage in the app. The shell caps at max-w-[1600px], the center column is max-w-2xl on home/explore (app/(shell)/home/page.tsx line 6), and the right rail is a fixed w-80 appearing at xl. On a 1600 to 2560px screen the feed stays 672px wide with large dead gutters either side.
**Recommendation:** At 2xl widen the center column, add a second right-rail column (trending cashtags, live courts, season standings), and let war/explore grids gain columns.

### 15. [MEDIUM/bug] Safe-area inset never applies: viewport-fit=cover is not set, and the padding is inside a fixed-height bar `components/shell/bottom-nav.tsx`
Line 13 uses pb-[env(safe-area-inset-bottom)] inside a h-16 flex row. env(safe-area-inset-*) returns 0 unless the page sets viewport-fit=cover, and app/layout.tsx exports no viewport config at all. Even if it applied, the padding sits inside the fixed 64px height, compressing the touch row instead of extending the bar, so on notched iPhones the nav sits over the home indicator.
**Recommendation:** Export viewport { viewportFit: 'cover' } from the root layout and move the env() padding onto the nav element itself (height auto plus padding), mirroring it in the shell's pb-24 main offset.

### 16. [MEDIUM/ux] Keyboard focus is invisible on core inputs and unbranded everywhere else `app/globals.css`
globals.css defines no :focus-visible styling at all, and the composer textarea, Call token input, and poll inputs use outline-none with no replacement ring (components/social/composer.tsx lines 107, 116, 192; also whispers, welcome, explore inputs). Keyboard users composing the flagship 'Send a raven' action get no focus indication; everywhere else the default UA blue ring clashes with the no-cool-glows brand rule.
**Recommendation:** Add a global :focus-visible style (gold hairline ring, e.g. outline: 2px solid rgba(200,162,76,.55)) and remove bare outline-none from inputs.

### 17. [MEDIUM/missing-feature] Rarity ladder CSS is incomplete versus the locked brand spec `app/globals.css`
Lines 245-267 define rarity-common/rare/epic/legendary/mythic. The brief's ladder is Common Steel, Uncommon Bone, Rare Gold, Epic Ember, Legendary 'radiant gold-bright with an ember rim', Mythic 'Blood with a gold edge'. .rarity-uncommon (Bone) is missing entirely, and legendary/mythic just swap the --rarity color: no ember rim on legendary, no gold edge on mythic, so the top tiers do not read differently from a brighter Rare.
**Recommendation:** Add .rarity-uncommon { --rarity: var(--bone) } and give legendary/mythic dedicated frame treatments (dual box-shadow: gold glow plus ember rim; blood border plus inner gold edge).

### 18. [MEDIUM/missing-feature] Feed filter sheet is a fraction of the brief spec and never closes on outside click `components/social/feed.tsx`
Brief 5.1 requires a filter sheet with hide AI-agent posts, hide token-feed spam, hide reposts, plus chain, $cashtag, House and media-video filters. The popover (lines 124-154) has only hideHerald, mediaOnly, callsOnly, all applied client-side to the already-fetched 30 posts (so 'Calls only' can show an empty page while matching posts exist on the server). It also lacks outside-click and Escape dismissal, and its toggle pills are 14px tall unlabeled spans.
**Recommendation:** Move filters into the fetch query, add the missing brief filters (at minimum hide reposts and House/chain), close on outside click and Escape, and make toggles real switch controls with aria-checked.

### 19. [MEDIUM/ux] No infinite scroll: manual 'Older ravens' button contradicts brief 5.1 `components/social/feed.tsx`
Brief 5.1 specifies 'Real-time (Supabase realtime), infinite scroll'. The feed paginates via a manual button (lines 194-201) and new realtime posts only set a hasNew flag requiring a click plus a full reload that resets scroll position. For the addictive TikTok/X energy the brief targets, every scroll stop is friction.
**Recommendation:** Add an IntersectionObserver sentinel to auto-append pages, and prepend realtime posts (or keep the pill but anchor scroll position on load).

### 20. [MEDIUM/bug] Side nav active-state matching by startsWith highlights the wrong item `components/shell/side-nav.tsx`
Line 27: pathname.startsWith(item.href). On /ravens (notifications), the tools item 'The Raven' (href /raven) matches, so the AI tool lights up while viewing notifications. Any future /housekeeping style route would light 'Houses'. Bottom nav uses the same pattern (components/shell/bottom-nav.tsx line 15) and lacks aria-current on the active item, so active state is conveyed by color alone.
**Recommendation:** Match on exact path or segment boundary (pathname === href || pathname.startsWith(href + '/')) and add aria-current="page" to active links in both navs.

### 21. [MEDIUM/performance] Dozens of stacked backdrop-filter layers in the feed will hurt scroll performance on mobile `app/globals.css`
Every post card is .glass with backdrop-filter: blur(14px) (line 118), sitting above a fixed blurred TopBar and BottomNav (backdrop-blur-xl), with inline PriceCards adding more glass per post. On mid-range Android hardware, tens of simultaneous backdrop blurs during scroll is a known jank source, threatening the 'instant feel' bar the brief sets.
**Recommendation:** Drop backdrop-filter from in-feed cards (they sit on an opaque obsidian page; a solid translucent gradient looks identical) and reserve real blur for overlays and the fixed bars.

### 22. [LOW/polish] Meta description sells 'serious DeFi investors', contradicting the fun-first brand rule `app/layout.tsx`
Lines 17-21: description says 'The creator-first on-chain platform for serious DeFi investors.' Rule R5b: fun-first, not a crypto app, 'never let it read as a crypto terminal'. This is the first line search engines and link unfurls show. There is also no Open Graph or Twitter card metadata and no themeColor, so shares of a social platform render bare.
**Recommendation:** Rewrite the description around the social realm and games, and add openGraph/twitter metadata with a brand image plus themeColor #07070A.

### 23. [LOW/polish] Composer submit says 'Post' and blocks valid poll-only ravens `components/social/composer.tsx`
The naming map says compose is 'Send a Raven', yet the button (line 262) says 'Post'. Separately, both send() (line 53) and the disabled condition (lines 255-259) require body text, a call token, or an image; a user who fills two poll choices with no body is stuck with a disabled button and no explanation.
**Recommendation:** Label the button 'Send a Raven' (or 'Send') and include a valid poll (>=2 filled options) in the can-send condition.

### 24. [LOW/missing-feature] Composer lacks brief 5.10 features: video, cashtag autocomplete, drafts, go-live `components/social/composer.tsx`
The file input accepts only image/jpeg,png,webp,gif (line 219) though the brief makes VIDEO a headline post type; there is no cashtag autocomplete with live price, no drafts, and no go-live entry from compose. Video appears only in PostCard rendering, so no user can actually produce one.
**Recommendation:** Accept video/mp4 and video/webm with a size cap, add a $cashtag typeahead hitting the existing /api/token, and persist a draft to localStorage.

### 25. [LOW/ux] Poll voting gives no error handling, no vote-state semantics, and locks instantly `components/social/post-card.tsx`
PollBlock (lines 19-31) sets voted=true before the request and never rolls back on failure, so a failed vote silently discards the user's voice while the UI pretends it counted. Options are plain buttons with no aria-pressed or disabled state after voting, and unauthenticated users are hard-redirected via window.location.href losing SPA state.
**Recommendation:** Roll back on failure, disable options and mark the chosen one (aria-pressed) after voting, and use router.push('/signin') with a returnTo param.

### 26. [LOW/polish] Webkit scrollbars unstyled: Safari shows light scrollbars on the obsidian theme `app/globals.css`
Lines 342-346 set scrollbar-width: thin and scrollbar-color, which Firefox and recent Chrome honor, but Safari supports neither and falls back to default overlay/light scrollbars against #07070A surfaces (side nav overflow-y-auto, whispers lists, admin tables).
**Recommendation:** Add ::-webkit-scrollbar, ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-track rules matching --steel-line on transparent.

### 27. [LOW/ux] Avatars always alt="" and the icon system silently swallows unknown names `components/social/avatar.tsx`
Avatar renders user images with alt="" (line 28), hiding author identity from screen readers on every post; combined with icon-only action buttons this makes cards read as bare text. Icon (components/ui/icon.tsx line 185) falls back to a generic circle for unknown names, so a typo in an icon name ships as a meaningless blob instead of failing loudly.
**Recommendation:** Set alt to the display name/handle on avatar images, and in dev throw or warn on unknown icon names.

### 28. [LOW/ux] SideNav closes the mobile drawer on ANY click inside it, including non-navigation taps `components/shell/side-nav.tsx`
Line 56 attaches onClick={onNavigate} to the whole nav element. In the drawer, tapping whitespace, a group label, or missing a link closes the drawer, which feels glitchy; brief-quality shells only dismiss on actual navigation or explicit close.
**Recommendation:** Move the onNavigate call onto the Link elements (or check event.target.closest('a') before closing).

### 29. [IDEA/idea] Wire the right rail with real trending content and the Ravens bell `components/shell/right-rail.tsx`
The rail is fully static: an @raven card and a 'Live ravens' placeholder paragraph (lines 29-37). The brief describes it as 'the Raven dock + live ravens/trending'. The data already exists in the product: live courts (/api/rooms), trending cashtags (/api/token), House standings (throne data).
**Recommendation:** Render top live courts with join buttons, top cashtags with mini PriceCards, and current Season House standings; add the notifications bell with unread count to the rail header for desktop.

### 30. [IDEA/idea] Anchor the onboarding tour to real UI instead of a centered modal `components/onboarding/tour.tsx`
The tour is five generic text cards in a centered dialog; it names The Ravenry, Calls, Houses, The War and @raven but never points at where they live, so users close it and still cannot find the Rookery or the filter sheet. The brief's onboarding is a '30-second guided tour'.
**Recommendation:** Spotlight actual elements (bottom nav items, composer, side nav groups) with a dimmed cutout and arrow, one step per anchor, keeping the reduced-motion handling it already has.

### 31. [IDEA/idea] Give the gold FAB a dual role: compose plus summon @raven `app/(shell)/layout.tsx`
The brief's mobile spec calls for both a floating '+' compose and a floating Raven action opening a full-screen sheet. Only compose exists (lines 22-28), so the platform's signature AI is buried in the drawer on mobile.
**Recommendation:** Long-press or split the FAB into a two-action speed dial (Send a Raven / Summon @raven), or add a second smaller raven FAB above it opening the Raven sheet, with a spring stagger animation.


## Backend + data model (app/api/**, lib/points.ts, lib/ai/*, Supabase schema on the ravenspire project)

### 1. [CRITICAL/security] profiles table is world-readable with all columns, leaking privy_id, wallet_address, and is_admin `lib/social/queries.ts`
Client-side feed queries (lib/social/queries.ts) read posts/profiles with the anon key, which requires a public SELECT policy. Verified in pg_policies on the live ravenspire DB: profiles has policy 'public read' with qual true. RLS is row level, not column level, so anyone with the shipped anon key can select privy_id, wallet_address, x_handle, is_admin, and every other column for every user, e.g. supabase.from('profiles').select('*'). This deanonymizes wallets against social identities, which is a serious privacy and targeting risk for a SocialFi app, and exposes which accounts are admins.
**Recommendation:** Replace the public SELECT policy with a security-definer view or a policy limited to a safe column set (create a public_profiles view with handle, display_name, avatar_url, bio, house_slug, tier, renown, points, glory, is_agent, created_at and point client queries at it). Never expose privy_id, wallet_address, or is_admin to anon.

### 2. [CRITICAL/security] War battle rewards fully trust the client: infinite glory, gold, and tier farming `app/api/war/battle/route.ts`
POST /api/war/battle accepts result: 'victory' and kills from the request body with no battle session, nonce, replay validation, or rate limit. The comment claims 'server-authoritative rewards' but the server only clamps numbers: any authenticated user can loop POSTs with result=victory, kills=200 and mint up to 400 glory plus 40 gold per request. award() then inflates renown, tier (up to King), house glory (the Claim the Throne leaderboard), and the future $RAVEN points-to-token conversion. The endpoint also skips the onboarded check that posts/comments enforce.
**Recommendation:** Issue a signed battle session server-side at battle start (battle id, champion, battlefield, started_at), verify elapsed time vs duration_s and kills-per-second plausibility at settlement, mark the session consumed, and rate limit battles per profile per hour. Long term, run the deterministic sim server-side per brief 11.E/11.K.

### 3. [HIGH/security] Points economy is trivially farmable: posts, comments, and quests mint points with no rate limit or quality weighting `app/api/posts/route.ts`
Every post awards 5 points + 2 glory (8 for a call), every comment 2 points + 1 glory, and /api/quests POST simply believes the client that a quest was done (insert user_quests then award, no verification of the underlying action, app/api/quests/route.ts). A script can post in a loop and climb the tier ladder and house leaderboard unboundedly. The brief (5.0) explicitly requires points weighted by standing and quality with sybil resistance; none of that exists, and points convert to real $RAVEN at season snapshots (6B), so this is future real-money leakage.
**Recommendation:** Add per-profile rate limits and daily caps on point-earning actions, shift rewards toward engagement received rather than actions performed, verify quests server-side against actual events (posts sent, rooms attended), and record an idempotency key per award.

### 4. [HIGH/bug] Call verdicts settle against the wrong token: settlement looks up by symbol, ignoring the stored address and chain `app/api/cron/verdicts/route.ts`
When a Call is created, posts/route.ts stores address and chain in the call JSON precisely to pin the asset. But the cron settles with lookupToken(call.token) (line 52), which runs a DexScreener free-text search on the symbol and picks the highest-liquidity pair (lib/data/tokens.ts). Symbols are not unique on DEXes; a Call sealed on a small token whose ticker collides with a bigger token (or whose liquidity ranking shifts) is verdicted against a different asset's price. Verdicts drive 40 points + 25 glory and the Signal tab's credibility, violating the founder's R2 'real data only' rule in spirit.
**Recommendation:** Add a lookupTokenByAddress(chain, address) helper using DexScreener's /latest/dex/tokens/{address} endpoint and settle strictly against the stored pair. Fall back to symbol only when address is null, and record which pair settled the verdict.

### 5. [HIGH/bug] award() is non-atomic: ledger and profile totals can drift, and concurrent awards lose points `lib/points.ts`
award() inserts into points_ledger (insert error silently ignored), then does a read-modify-write on profiles.points/glory/renown, then a second read-modify-write on houses.glory. Nothing is transactional. Two concurrent awards read the same profile row and one increment is lost; a failed ledger insert still updates totals; a crash between steps leaves ledger and totals disagreeing. The code comment says 'the ledger is the source of truth; totals are a cached convenience' but there is no reconciliation job, so drift is permanent and will surface at the merkle snapshot when points become $RAVEN.
**Recommendation:** Move award into a single Postgres function (RPC) that inserts the ledger row and does UPDATE profiles SET points = points + $1 ... in one transaction, or use triggers on points_ledger. Add a scheduled reconciliation that recomputes totals from the ledger.

### 6. [HIGH/security] war_state read-modify-write races allow chest duplication, double daily claims, and free upgrades `app/api/war/rewards/route.ts`
All three actions read war_state, check, then write absolute values. Two concurrent open_chest requests with chests=1 both pass the check, both add gold (80-200 each) and both write chests = state.chests - 1 = 0, so one chest pays twice and can unlock two champions. Concurrent 'daily' requests both pass the last_daily check and both call award (glory doubles). Concurrent 'upgrade' requests both compute gold - cost from the same snapshot, so two mastery levels cost one payment. These are practical exploits with two parallel fetches.
**Recommendation:** Use atomic conditional updates: UPDATE war_state SET chests = chests - 1 WHERE profile_id = X AND chests >= 1 RETURNING *, and gate daily with WHERE last_daily IS DISTINCT FROM today. Only award after the guarded update reports a row changed.

### 7. [HIGH/bug] DM threads break after 200 messages: query returns the oldest 200 and never shows new messages `app/api/whispers/messages/route.ts`
GET orders messages ascending with limit 200 (lines 29-34). Once a conversation exceeds 200 rows, the query always returns the first 200 ever sent; every newer message is invisible to both parties forever, while last_read_at is still bumped so unread counts silently vanish. An active DM pair hits this within days.
**Recommendation:** Order descending, limit 200, reverse in memory before returning, and add a before cursor for history pagination.

### 8. [HIGH/missing-feature] Re-raven (repost) writes a row and bumps a counter, but reposts are never rendered anywhere `app/api/social/route.ts`
The repost action inserts into reposts (with optional quote) and increments posts.repost_count, but no query in the app ever reads the reposts table: fetchFeed/fetchProfilePosts (lib/social/queries.ts) select only from posts. A quote re-raven, a core brief 5.1 action, produces zero visible output for followers or on the reposter's Keep, so the amplification loop of the whole social product does not exist. There is also no un-repost, so the counter can only grow.
**Recommendation:** Either materialize reposts as posts rows (kind='reraven', ref to original) so feeds pick them up naturally, or union reposts into feed queries. Add a toggle-off path that decrements the counter.

### 9. [HIGH/missing-feature] Reports queue can never fill: no endpoint or UI writes to the reports table `app/api/admin/reports/route.ts`
The admin moderation screen reads reports with status='open', but a repo-wide search shows the only references to the reports table are the two admin routes; there is no POST /api/reports and no Report action wired in post-card or profile menus. The brief (5.2, 8C) requires user-facing Report on posts/comments/profiles feeding the moderation queue. As shipped, moderation is a dashboard over a permanently empty table.
**Recommendation:** Add POST /api/reports (subject_type, subject_id, reason, reporter_id, dedupe per reporter+subject) and wire it to the '...' menus on posts, comments, and Keeps.

### 10. [HIGH/security] Blocks are enforced client-side only: blocked users can still comment, like, follow again, and read everything `app/api/blocks/route.ts`
Blocking deletes follows both ways and DM creation checks blocks (app/api/whispers/route.ts), but nothing else does: the follow action in app/api/social/route.ts lets a blocked user immediately re-follow; likes, comments, mentions, and duel challenges from blocked users all proceed and generate notifications to the blocker; feed hiding is a client-side Set filter in components/social/feed.tsx line 187 (only in the feed, not on post detail, comments, whispers search, or profiles). Data-wise everything is public-read anyway.
**Recommendation:** Enforce blocks server-side in social verbs (like, comment, follow, duel, mention notifications) with a shared isBlocked(db, a, b) helper, and filter blocked authors in comment fetches and notification inserts.

### 11. [HIGH/missing-feature] Season engine is absent: seasons table has one orphan row, no snapshot, no merkle claim, no throne settlement `lib/points.ts`
The live DB has a seasons table (1 row) that no code reads or writes; grep across app/api and lib finds zero references. The economic core of the brief (6B: season snapshot -> merkle root -> user claims $RAVEN; 11: top house claims the Throne every ~4 weeks with a reward vault) has no backend at all: no season boundaries on points_ledger (rows have no season id), no snapshot job, no claim table, no vault split. Points earned now cannot be cleanly attributed to Season 1 later without retroactive timestamp slicing.
**Recommendation:** At minimum stamp points_ledger rows with season_id now (backfillable from the seasons row), add a season close job that freezes standings, and design the claims table before launch. The merkle contract can come later, but the ledger partitioning must exist from day one.

### 12. [MEDIUM/bug] All cached counters (like_count, reply_count, repost_count, view_count, member_count, houses.glory) use racy read-then-write updates `app/api/social/route.ts`
Every counter update in the codebase is select current value, add 1 in JS, write absolute value (social route lines 33-42 and 76-85, comments route lines 43-46, views route lines 19-28, mention.ts lines 51-60, onboard route lines 62-71, points.ts lines 57-68). Two concurrent likes lose one increment; the truth tables (reactions, post_views, house_members) diverge from the cached counts over time, and the unlike path clamps at 0 which masks drift instead of fixing it.
**Recommendation:** Replace with atomic SQL (UPDATE posts SET like_count = like_count + 1) via RPC, or better, triggers on reactions/comments/reposts/post_views that maintain the counters, plus a nightly recount job.

### 13. [MEDIUM/bug] Like dedup abuses points_ledger as an index with per-user reason strings `app/api/social/route.ts`
First-like detection queries points_ledger where reason = 'liked_by_<uuid>' and ref = subject_id (lines 45-51). The only index on points_ledger is (profile_id, created_at DESC), so this filter scans all of an author's ledger rows per like, and it pollutes the ledger's reason vocabulary with unbounded per-user strings, making season analytics (group by reason) useless. It also means deleting ledger rows ever would reopen like-minting.
**Recommendation:** Add a dedicated like_awards table with PK (post_id, liker_id), or a unique partial index on points_ledger (profile_id, reason, ref). Use a stable reason like 'liked' and put the liker in ref metadata.

### 14. [MEDIUM/performance] Whispers conversation list is an N+1 that runs on an 8-second client poll `app/api/whispers/route.ts`
GET loops over up to 50 conversations issuing one exact-count query per conversation for unread counts (lines 40-52), so a user with 50 DMs costs 53 sequential queries per request, and app/(shell)/whispers/page.tsx polls every 8s while comment threads poll every 15s and the rookery every 12s. This multiplies at even modest DAU and adds latency serially.
**Recommendation:** Compute unread counts in one grouped query (select conversation_id, count(*) from messages joined against last_read_at, group by conversation_id) or a Postgres function, and move DMs to Supabase realtime channels instead of polling.

### 15. [MEDIUM/bug] Feed pagination cursor on created_at alone can skip or duplicate posts; comments and bookmarks have hard caps with no paging `lib/social/queries.ts`
fetchFeed pages with lt('created_at', before) (line 25). Posts sharing a timestamp (bulk inserts, imported content, same-ms writes) straddling a page boundary get skipped. fetchComments hard-limits 200 with no cursor so thread replies past 200 are unreachable, bookmarks caps at 100 (app/api/bookmarks/route.ts), admin users list caps at 50 with no search or paging (app/api/admin/users/route.ts).
**Recommendation:** Use a composite keyset cursor (created_at, id) with or-based tie-breaking, and add before cursors to comments, bookmarks, and admin lists.

### 16. [MEDIUM/bug] Duel settlement can double-award and duels never expire `app/api/duels/route.ts`
The vote path settles when a side reaches 5 votes with a lead of 2, but the settling UPDATE (lines 103-106) is conditioned only on id, not on status='voting', and the votes recount is a full fetch. Two concurrent qualifying votes both see the threshold and both run the settle branch: 60 glory + 30 points awarded twice, two winner notifications. Separately, ends_at is written at creation (line 36) but nothing ever reads it: open duels with no opponent and voting duels that never hit threshold linger forever, and the verdict cron does not touch duels.
**Recommendation:** Settle with UPDATE duels SET status='settled', winner_id=$1 WHERE id=$2 AND status='voting' and only award when a row was actually updated. Add duel expiry to the cron (settle by majority at ends_at, or void).

### 17. [MEDIUM/bug] DM dedupe ignores conversation kind, will misfire once group or house chats exist `app/api/whispers/route.ts`
The reuse-existing-DM query (lines 94-102) joins conversations!inner(kind) but never filters kind='dm'; it returns the first conversation both users share. The schema and brief (5.6: DMs + group chats + house chats in one system) plan for group conversations; the moment those ship, two users who share a group chat can never open a private DM, they get routed into the group. The GET's 'other' map (lines 35-37) has the same one-member assumption.
**Recommendation:** Add .eq('conversations.kind', 'dm') to the dedupe query and verify the shared conversation has exactly 2 members. Shape the GET response around member lists, not a single 'other'.

### 18. [MEDIUM/bug] Verdict cron has no run-lock or conditional update: overlapping runs double-award call hits `app/api/cron/verdicts/route.ts`
The settle UPDATE (lines 57-67) is keyed on post id only, not on call->>verdict still being 'open', and there is no advisory lock or job dedupe. Two overlapping cron invocations (retry, manual + scheduled) both read the same open calls and both award 40 points + 25 glory per hit and insert duplicate notifications. Also the filter call->>verdict has no expression index, so this becomes a sequential scan over the whole posts table as it grows.
**Recommendation:** Guard the update with .filter("call->>verdict","eq","open") and only award/notify when a row was updated; add a partial index on posts ((call->>'verdict')) where kind='call', and consider pg_advisory_lock via RPC for the run.

### 19. [MEDIUM/missing-feature] Notification system is a single-row insert with no mention fan-out, no toggles, no channels, and a spam vector `app/api/notifications/route.ts`
Brief 5.9 requires mentions, house invites, whale/Watch alerts, live-room starts, plus push, email, and Telegram with per-type toggles. Implemented: in-app rows for like/follow/reply/reraven/duel/call_verdict only. @mentions of regular users notify no one (only @raven is parsed, lib/ai/mention.ts). Follow/unfollow toggling inserts a fresh notification every cycle with no dedupe or rate limit, an easy harassment vector. There is also no delete/prune, so the table grows forever, and mark-all-read is the only write.
**Recommendation:** Parse @handle mentions in posts/comments and fan out notification rows; dedupe follow notifications per (actor, profile) within a window; add notification_prefs; schedule pruning of read rows older than N days.

### 20. [MEDIUM/missing-feature] Tips table exists in the DB but tipping has zero code paths `app/api/social/route.ts`
The live schema has a tips table (RLS enabled, no policies, zero references in the repo). The brief makes tips one of the two creator monetization channels at launch (5.0 'creators also earn via TIPS and LIVE rooms', 5.2 Tip action on profiles and posts). No API route, no UI action, no ledger integration exists.
**Recommendation:** Either ship a minimal tip flow (user-signed on-chain transfer recorded into tips with a notification and points for the recipient) or remove the table and mark tips as a flagged Coming Soon so the schema does not rot.

### 21. [MEDIUM/missing-feature] Referral system records the tree but never rewards anyone and has no leaderboard `app/api/onboard/route.ts`
Onboarding stores referrals (profile_id, referrer_id) and mints a referral code equal to the handle (lines 73-88), with a comment 'unlocks on activity later; recorded now'. Nothing later exists: no activity check, no award to referrers, no referral count on profiles, no leaderboard, no Bannerlord crest progress. Brief 5.8 calls Raise Your Banners a REAL system with rewards unlocking on referred-user activity. Also referral_codes PK is the handle string, and since handles cannot change (no endpoint), codes are frozen at onboarding names.
**Recommendation:** Add an activity trigger (e.g. referred user reaches 100 renown) that awards the referrer via award() with reason 'referral_activated', expose counts on the Banners page, and back the leaderboard with a grouped query.

### 22. [MEDIUM/security] Upload pipeline trusts client MIME, cannot handle video, never deletes objects, and the public bucket allows listing `app/api/upload/route.ts`
The route validates file.type (client-controlled) rather than sniffing magic bytes, so any bytes labeled image/png are stored and served from the public media bucket. Video is not accepted at all, yet posts/route.ts happily stores media type 'video' and brief 5.3 requires in-feed video; the pipeline can never produce one. No thumbnail/transcode step, no object deletion when content is removed (no delete endpoints exist anyway), and the Supabase security advisor flags the media bucket's broad SELECT policy as allowing full bucket listing.
**Recommendation:** Sniff magic bytes server-side, drop the broad storage.objects SELECT policy (public URL access does not need it), add a video path (size-capped MP4/WebM upload or a provider like Mux), and garbage-collect orphaned objects.

### 23. [MEDIUM/missing-feature] No delete path for posts or comments despite soft-delete columns and brief requirement `app/api/posts/route.ts`
posts.deleted and comments.deleted exist and every read filters on them (queries.ts, verdicts cron), and the posts RLS policy is qual (NOT deleted), but there is no DELETE or update endpoint for authors (brief 5.4 'delete own') and no admin takedown route (the moderation screen can only resolve/dismiss reports, app/api/admin/reports/route.ts). Once the reports queue is wired, admins still could not act on content.
**Recommendation:** Add DELETE /api/posts/:id (author or admin, sets deleted=true, decrements nothing but hides), same for comments, and an admin moderation action that soft-deletes plus notifies the author.

### 24. [MEDIUM/performance] View counting only fires on the post detail page and races; feed impressions are never counted `app/api/views/route.ts`
post_views has a solid PK (post_id, viewer_id, day) confirmed in the live schema, but the only caller is app/(shell)/post/[id]/page.tsx line 23, so view_count only reflects detail-page opens, not feed impressions, making the number misleadingly tiny versus what creators expect. The counter increment is the usual racy read-then-write, and each view costs two extra queries. Anonymous views are dropped silently.
**Recommendation:** Batch impressions client-side (IntersectionObserver over feed cards, flush an array of post_ids every few seconds to one endpoint) and use a single upsert plus atomic increments, or count views from post_views nightly.

### 25. [MEDIUM/bug] House glory attribution and member_count drift: racy increments and glory awarded before or without house membership context `lib/points.ts`
houses.glory and houses.member_count are read-then-written (points.ts lines 57-68, onboard route lines 62-71) so concurrent awards lose glory, and glory earned by a user with no house (war battles are playable pre-onboarding since app/api/war/battle/route.ts skips the onboarded check) simply vanishes from the house race with no ledger trace of the intended attribution. There is no house_glory ledger, so the season's core scoreboard cannot be audited or recomputed.
**Recommendation:** Record house_slug on every points_ledger row at award time, derive houses.glory as an aggregate (view or trigger-maintained), and require onboarding for glory-earning game endpoints.

### 26. [MEDIUM/bug] Rooms have no lifecycle hygiene: abandoned live courts persist forever and participant lists leak to everyone `app/api/rooms/route.ts`
A room only ends when its host explicitly posts action 'close'. A host who closes the tab leaves a 'live' room permanently (the one-live-room-per-host check at lines 100-113 then blocks them from ever opening another). There is no heartbeat, TTL, or cron sweep. The public GET also returns participant_ids for every room to any caller, and room_participants is public-read in RLS, so who-is-listening-where is fully enumerable.
**Recommendation:** Add last_seen_at heartbeats from clients and a cron that ends rooms with no host heartbeat for N minutes; return participant counts plus a capped preview of profiles rather than raw id lists.

### 27. [MEDIUM/polish] Schema lives only in the hosted DB: no migrations, seeds, or rollback story in the repo `AGENTS.md`
The repo contains zero .sql files; the four migrations (realm_core_schema, seed_raven_agent, realm_wave2_social_live, realm_wave3_whispers_media) exist only in the ravenspire Supabase project's migration table, applied via MCP. Code review cannot see constraints, a fresh environment cannot be provisioned, there is no local dev database story, and there is no documented backup/restore or rollback plan for a data-bearing social product (founder rule R6/R9 territory).
**Recommendation:** Vendor the migrations into supabase/migrations/ via supabase db pull, commit them, add a seed script, and write a short RUNBOOK covering PITR settings, backup cadence, and rollback.

### 28. [MEDIUM/security] Onboarding gate is inconsistently enforced across earning and social endpoints `app/api/war/battle/route.ts`
posts, comments, polls, duels, rooms, and whispers check profile.onboarded, but war/battle POST, war/rewards POST (daily, chests, upgrades), blocks, and profile edit do not. A shell account that never picked a handle or house can farm war glory and gold, claim dailies, and edit its profile. Combined with the battle-trust issue this widens the sybil surface since un-onboarded shells are cheap to mass-create via Privy test accounts.
**Recommendation:** Centralize the gate: add requireOnboarded(profile) used by every point/glory-earning or content-writing route, and decide explicitly which routes are exempt.

### 29. [LOW/bug] Handle claim TOCTOU returns a raw 500 instead of a 409, and ilike check vs binary unique index disagree `app/api/onboard/route.ts`
Availability is checked with ilike then written later (lines 40-56); two concurrent onboards can both pass the check and one hits the UNIQUE (handle) constraint (confirmed in live schema), surfacing as the generic 500 'Could not save' instead of the friendly 409 path. The DB index is case-sensitive while the app checks case-insensitively; the lowercase regex keeps them aligned today, but any future admin or script that writes mixed-case handles bypasses the app-level uniqueness.
**Recommendation:** Catch the unique-violation error code (23505) on the update and return the 409 message; add a unique index on lower(handle) so the DB enforces what the app assumes.

### 30. [LOW/bug] Raven AI rate limit is per-instance memory: resets on cold start and multiplies across serverless instances `app/api/raven/route.ts`
The usage Map (lines 6-8) lives in module scope. On Vercel each lambda instance has its own Map, so the real limit is 20 per hour per instance, not per user, and every cold start resets it. Anthropic spend is therefore effectively unbounded under load or targeted abuse, and the in-feed @raven path (lib/ai/mention.ts) has no rate limit at all: a user can spam '@raven ...' posts and burn tokens on every one.
**Recommendation:** Move rate limiting to Postgres (an upsert-counter table keyed by profile and hour) or Upstash, and apply the same budget to maybeRavenReply so mention-triggered completions count against the caller.

### 31. [LOW/performance] Feed realtime subscription listens to every post insert with no server filter and only sets a flag `lib/social/queries.ts`
subscribeToFeed (lines 119-132) opens a postgres_changes channel on all INSERTs to posts. At scale every connected client receives every post event just to light up the 'New ravens' pill, and Supabase realtime on the free tier will throttle. Meanwhile the surfaces that genuinely need realtime (comments 15s poll, DMs 8s poll, notifications on navigation) use polling instead.
**Recommendation:** Invert the usage: keep a cheap periodic count query for the new-posts pill, and spend realtime channels on messages (filter by conversation_id), comment threads, and the notifications bell.

### 32. [LOW/bug] Bookmarks GET does not exclude deleted posts `app/api/bookmarks/route.ts`
The join select on posts (lines 10-17) has no deleted=false filter, unlike every other post query. Once soft-deletion is actually wired, deleted posts will resurface in the Bookmarks page through the admin-client query (which bypasses the RLS NOT deleted qual that protects anon reads).
**Recommendation:** Add .eq('post.deleted', false) or filter rows where post.deleted is true after the join, and treat null joins (hard-deleted posts) as already handled.

### 33. [LOW/ux] Duplicated shell route tree ships stale pages at /app/* paths `app/(shell)/app/(shell)/home/page.tsx`
An entire second copy of the shell pages exists under app/(shell)/app/(shell)/** (watch, war, throne, raven, home, explore, and 14 more), which Next.js serves as live routes at /app/watch, /app/home, etc. These are clearly an accidental copy from a refactor: duplicated code drifts from the real pages, bloats the build, and search engines or users who land on /app/home see an unmaintained variant.
**Recommendation:** Delete the nested app/(shell)/app directory after diffing for any changes that only live there, and add a redirect for /app/:path* if any links leaked.

### 34. [IDEA/idea] Make the points ledger idempotent with a uniqueness key and season stamping `lib/points.ts`
Almost every economy race found above (double duel settle, double cron award, double daily) would be defanged if points_ledger enforced uniqueness per logical event. Today reasons are free strings and refs optional, so retries always double-mint. The ledger is also missing season and house columns that the merkle snapshot and Claim the Throne settlement will need.
**Recommendation:** Add columns (season_id, house_slug, event_key) with a unique index on (profile_id, event_key), have award() derive event_key from reason+ref, and ignore conflicts. This makes every award safely retryable and the season snapshot a pure SQL aggregate.

### 35. [IDEA/idea] Trigger-maintained counters plus a nightly reconciler as the counter-drift endgame `app/api/social/route.ts`
Six different routes hand-maintain seven cached counters against five truth tables (reactions, comments, reposts, post_views, house_members). Each is a race and a divergence source, and new features (unrepost, comment delete, admin takedown) will each need to remember every counter they touch.
**Recommendation:** Move counter maintenance into Postgres AFTER INSERT/DELETE triggers on the truth tables, delete all JS counter code, and run a nightly recount job that repairs any residue. This also makes future admin deletions automatically consistent.

### 36. [IDEA/idea] Signal tab should rank by verified outcomes, which the data model can already almost support `lib/social/queries.ts`
The brief defines Signal as 'top by verified outcome', but fetchFeed's signal tab is just kind='call' ordered by recency (lines 26). Since verdicts (hit/miss, settled_price) already live in the call JSON and points_ledger has call_hit rows, a creator win-rate and a hit-weighted Signal ranking are one aggregate away, and they would also power the profile 'Calls Won' stat the brief requires.
**Recommendation:** Maintain per-profile calls_made/calls_hit counters (trigger off verdict settlement), rank Signal by author win-rate and recency, and expose win-rate on Keeps. This is the single highest-leverage credibility feature in the brief that the schema is already close to supporting.


## Landing, Chronicle, growth loops

### 1. [CRITICAL/bug] Referral loop is broken end to end, banner param is dropped before it can ever be recorded `app/welcome/page.tsx`
The referral link built in app/(shell)/banners/page.tsx points to /welcome?banner=handle. app/welcome/page.tsx line 32 does router.replace("/signin") for unauthenticated visitors, which discards the ?banner query. app/signin/page.tsx has no post-auth redirect at all (no useRouter, no authenticated effect), so the recruit never returns to /welcome with the param. The referral is read only from window.location.search at the finish step of /welcome (lines 39-42), so in the normal recruit journey the referral is lost 100 percent of the time. The referrals table written by app/api/onboard/route.ts will stay empty in practice.
**Recommendation:** Persist the banner code to localStorage or a cookie the moment any page sees ?banner=, redirect back to /welcome after auth preserving query, and read the stored code in the onboard call as a fallback. Add an activity-unlock job that actually reads the referrals table.

### 2. [CRITICAL/security] Quest completion is pure self-report, points that convert to $RAVEN are free for the taking `app/api/quests/route.ts`
POST /api/quests (app/api/quests/route.ts lines 27-44) accepts any quest slug from the client and immediately awards glory and points via award() with zero verification that the deed happened (welcome 3 newcomers, win a duel, attend a court, etc). The only guard is one insert per period. Since the brief says points convert to $RAVEN at season claims, a curl loop can harvest every daily and weekly quest each day, inflating the season pool and House standings.
**Recommendation:** Derive quest completion server-side from real events (posts, duels, room attendance already in the DB) and remove the client-claim path, or at minimum verify each slug against its underlying activity before awarding.

### 3. [HIGH/bug] Weekly and seasonal quests can be completed once per day, not once per period `app/api/quests/route.ts`
app/api/quests/route.ts line 31 sets period = new Date().toISOString().slice(0,10) (a day string) for every quest regardless of quest.cadence. The uniqueness check therefore only blocks repeats within the same calendar day, so weekly quests like seven-day-streak (200 glory, 120 points in lib/game/quests.ts) are claimable 7 times per week and seasonal quests are claimable daily.
**Recommendation:** Compute period from cadence: ISO week start for weekly, season id for seasonal, day for daily.

### 4. [HIGH/missing-feature] Zero SEO surface: one metadata export in the whole app, no OG images, no robots, no sitemap `app/layout.tsx`
Grep confirms the only metadata in the app is the root export in app/layout.tsx. There is no generateMetadata anywhere, no metadataBase, no opengraph-image or twitter-image, no app/robots.ts, no app/sitemap.ts, and public/ contains only create-next-app boilerplate svgs. Post pages, keeps, houses, chronicle and coming-soon pages all render the generic title The Ravenspire when shared or indexed.
**Recommendation:** Add metadataBase plus openGraph/twitter blocks at root, generateMetadata on post/[id], u/[handle], houses/[slug], chronicle and soon/[slug], plus robots.ts and sitemap.ts.

### 5. [HIGH/missing-feature] No share cards for posts or keeps, share is a silent clipboard copy `components/social/post-card.tsx`
app/(shell)/post/[id]/page.tsx and app/(shell)/u/[handle]/page.tsx are use client pages with no server metadata, so a shared Call unfurls with no author, text, verdict or image. The only share affordance is components/social/post-card.tsx share() (line 143) which copies a link to the clipboard with no toast and a swallowed catch; there is no navigator.share and no share-to-X intent even though the audience lives on X. For a SocialFi product the share loop is the growth engine and it is effectively absent.
**Recommendation:** Add dynamic OG images via next/og (post text, author, house crest, Call verdict), a share-to-X intent link prefilled with the post URL, native navigator.share on mobile, and a Copied state.

### 6. [HIGH/bug] Sign-in page never redirects after successful auth, users are stranded `app/signin/page.tsx`
app/signin/page.tsx renders the Privy login buttons but has no effect watching authenticated to route the user onward. A user who signs in stays on the signin screen with the same buttons. There is also no logic anywhere that routes an authenticated but non-onboarded profile to /welcome; the only entry to onboarding is a link inside /keep (app/(shell)/keep/page.tsx line 75). New users can wander the shell un-onboarded and every write API rejects them with Finish onboarding first.
**Recommendation:** On authenticated, fetch /api/me and route: not onboarded goes to /welcome (preserving any stored referral), onboarded goes to /home. Also redirect already-authenticated visitors away from /signin.

### 7. [HIGH/bug] The Chronicle misdescribes both flagship games, contradicting the product and the brief `lib/data/chronicle.ts`
lib/data/chronicle.ts the-games section says Claim the Throne is the individual ladder where one ruler sits the throne per Season, and The War is the House game where all six Houses compete. The brief (foundation section 11) says the opposite: Houses compete on Glory and the top HOUSE claims the Throne each season, while The War is the real-time strategy RPG with champions and battlefields. The public docs teach users the wrong mental model of both games.
**Recommendation:** Rewrite the-games: Claim the Throne = House rivalry season (quests, duels, streaks, top House claims the Throne and the $RAVEN vault), The War = the real-time battle game with champions, arsenal and battlefields.

### 8. [HIGH/bug] Chronicle roadmap calls The Forge a future creator chapter while the app ships it live as staking `lib/data/chronicle.ts`
lib/data/chronicle.ts the-chapters-ahead describes The Forge as a coming chapter where creators shape new things for the realm. The brief mandates The Forge as the staking dApp built at launch, and lib/nav.ts already lists it live in toolsNav as Staking with a working /forge page. The docs contradict both the brief and the running product, and the roadmap also omits The Watch/Ledger/Scrying context while promising Prophecies as a deeper form of Calls, which drifts from the prediction-market descriptor used in nav.
**Recommendation:** Fix the chapter list to match comingSoonNav (Mint, Prophecies, Raven Unbound, Long Night), describe The Forge as live staking, and keep descriptors consistent with lib/nav.ts.

### 9. [HIGH/missing-feature] Landing page is missing most of brief 8B: no roadmap chapters, no Seasons section, no trust plus socials block, no imagery `app/page.tsx`
Brief 8B requires scroll-reveal sections for: the social plus creators, Claim the Throne, meet @raven, $RAVEN plus create-to-earn, Seasons/points, the Chapters roadmap, and a trust block with socials. app/page.tsx ships only 5 thin text-only cards; there is no Chapters/roadmap section, no dedicated Seasons/points section, no social links anywhere on the page or footer, no feature imagery or product screenshots, no crest showcase beyond the faint background, no social proof, and no FAQ. As a marketing site it is a hero plus five paragraphs.
**Recommendation:** Add the missing sections: a Chapters roadmap timeline reusing comingSoonNav, a Seasons/points explainer, a crests showcase strip, a trust block (non-custodial, exportable wallet) with X/Telegram/Discord links, and real product visuals per ART-PROMPTS area heroes.

### 10. [HIGH/missing-feature] Coming Soon pages have no working Notify me and send signed-in users to the sign-in page `app/(shell)/soon/[slug]/page.tsx`
app/(shell)/soon/[slug]/page.tsx renders a single CTA, Join the realm to get notified, hardlinked to /signin regardless of auth state. There is no waitlist/notify table, no API, and no per-feature interest capture anywhere in app/api. The brief (8A and section 9) explicitly requires each teaser to have a Notify me / Get notified CTA plus a Chapter II chip; the chip is also absent. The hype loop that should seed launch notifications collects nothing.
**Recommendation:** Add a feature_interest table plus POST /api/notify-me, make the button a real toggle for signed-in users (Notified state), keep the signin link only for guests, and add the Chapter II chip.

### 11. [HIGH/bug] Stray duplicated route tree ships about 20 placeholder pages at live /app/* URLs `app/(shell)/app/(shell)/banners/page.tsx`
app/(shell)/app/(shell)/ contains a full copy of the section list (banners, watch, war, throne, chronicle, home, etc) rendering SectionPlaceholder from lib/sections. Because route groups strip parens, these compile to live routes like /app/home and /app/banners serving placeholder content, which contradicts the real-data-only principle, duplicates crawlable URLs, and confuses navigation. An empty app/(shell)/public directory also lingers.
**Recommendation:** Delete the entire app/(shell)/app subtree and the empty public dir; verify build and grep for imports of lib/sections that remain.

### 12. [HIGH/missing-feature] No re-engagement channel exists: email, Telegram and push are entirely unwired `app/api/notifications/route.ts`
The brief (foundation lines 285-286 and section 12) requires notifications via in-app plus push plus email plus Telegram with per-type toggles, and lists RESEND_API_KEY and TELEGRAM_BOT_TOKEN. Grep across app/ and lib/ finds zero references to resend, telegram, web-push or any outbound channel; app/api/notifications/route.ts only reads and marks rows. Users who close the tab can never be pulled back, which guts retention for streaks, duels and season deadlines.
**Recommendation:** Wire Resend for email digests and verdict/duel alerts, a Telegram bot for opt-in DMs, and web push; fan out from a single notify() helper that checks per-type prefs server-side.

### 13. [HIGH/missing-feature] Streak mechanics exist only as copy, there is no tracking and no surface `lib/game/quests.ts`
Streaks are core to the brief (daily streaks in the game loop, the Lord of Light crest for devotion streaks, Knight of the Realm earnable via 7-day streak in components/brand/crests.tsx). But no table or column tracks consecutive-day activity, no API computes it, and no UI shows a streak counter (top-bar, home and renown pages have none). The only artifact is the self-reportable seven-day-streak quest, which is claimable without any streak existing.
**Recommendation:** Track last_active_day plus streak_count on profiles, bump it server-side on first qualifying action per day, surface a flame counter in the top bar and Keep, and derive the streak quest and crests from it.

### 14. [MEDIUM/bug] Notification preference toggles are localStorage cosmetics that no server code reads `app/(shell)/settings/page.tsx`
app/(shell)/settings/page.tsx stores notifyMentions, notifyReplies, notifyDuels, notifyHouse in localStorage only (the code even comments storage unavailable; the toggle still works for this visit). No API persists them and none of the notification-inserting code paths consult them, so muting mentions changes nothing. The brief requires per-type toggles that actually govern delivery.
**Recommendation:** Add a notification_prefs column or table, save via /api/me, and check prefs in the server paths that insert notifications.

### 15. [MEDIUM/missing-feature] Referral program has no stats, no tree, no leaderboard, and activity unlock is never computed `app/(shell)/banners/page.tsx`
The brief (lines 282-283) specifies a referral tree plus leaderboard with rewards unlocking on referred-user ACTIVITY. app/(shell)/banners/page.tsx shows only the copy-link card and three static explainer tiles: no recruit count, no active-recruit count, no earned rewards, no leaderboard. Server-side, referrals rows are written once at onboard (app/api/onboard/route.ts lines 74-84) and never read again anywhere; no job credits referrers when recruits act, so the Bannerlord crest and refer-3-active-users condition are unearnable.
**Recommendation:** Add GET /api/referrals returning recruits, active recruits and credited points, render stats plus a realm-wide top-referrers board, and award referrers from the existing award() path when a recruit crosses activity thresholds.

### 16. [MEDIUM/bug] Referral link domain hardcoded to ravenspire.vercel.app `app/(shell)/banners/page.tsx`
app/(shell)/banners/page.tsx line 50 builds the link as https://ravenspire.vercel.app/welcome?banner=... . On a custom domain, preview deployment, or local dev the copied link sends recruits to the wrong host (or a stale deployment), silently corrupting the loop.
**Recommendation:** Use window.location.origin or a NEXT_PUBLIC_APP_URL env var.

### 17. [MEDIUM/bug] Referral codes freeze at the onboarding handle while links use the current handle `app/api/onboard/route.ts`
app/api/onboard/route.ts lines 86-88 upsert referral_codes with code = handle at onboarding time (onConflict owner_id). The banners page builds links from the profile's current handle. If a user later renames via profile edit, their shared link carries the new handle but the lookup at lines 75-79 matches only the old code, so all future referrals from that user silently fail.
**Recommendation:** Update referral_codes whenever handle changes in /api/profile, or key links on an immutable code instead of the handle.

### 18. [MEDIUM/missing-feature] No PWA: no manifest, no icons, boilerplate svgs still in public/ `public`
There is no app/manifest.ts or public/manifest.json, no apple-touch-icon, no theme-color meta, and no icon set beyond app/favicon.ico. public/ still holds create-next-app leftovers (next.svg, vercel.svg, globe.svg, file.svg, window.svg). A mobile-first social game that cannot be added to the home screen with its own icon and splash loses the highest-retention surface it has.
**Recommendation:** Add app/manifest.ts with the raven mark icon set (192/512 plus maskable), theme-color #07070A, and delete the boilerplate svgs.

### 19. [MEDIUM/ux] The 30-second guided tour rarely fires and cannot be replayed, and it tours nothing `components/onboarding/tour-mount.tsx`
components/onboarding/tour-mount.tsx only shows the tour when the URL literally contains welcome=1, which is set solely by the /welcome finish redirect; since signin never routes users into /welcome (see the signin finding), most users never see it. Once dismissed, rvn_tour_done in localStorage blocks it forever with no replay entry point in settings or the Chronicle. The tour itself (components/onboarding/tour.tsx) is 5 generic text cards in a centered modal, not a guided tour anchored to the compose button, houses, quests or the war, which is what a 30-second guided tour implies in the brief (line 302). The brief's onboarding also includes claim starting Season points, which does not exist.
**Recommendation:** Anchor steps to real UI via element highlights, trigger on first onboarded session regardless of query string, add a Replay the tour link in settings, and grant the starting season points at onboard.

### 20. [MEDIUM/ux] Landing ignores existing sessions, returning users are funneled back through sign-in `app/page.tsx`
app/page.tsx always renders Enter the Realm linking to /signin. A logged-in user returning to the root sees the marketing page and must click through /signin (which, per the other finding, does not even redirect them). There is no Return to the Ravenry state and no session-aware header.
**Recommendation:** Read useRealmAuth on the landing CTA: authenticated users get Enter the Ravenry linking to /home.

### 21. [MEDIUM/bug] Coming Soon page uses tokens that do not exist, breaking the brand styling `app/(shell)/soon/[slug]/page.tsx`
app/(shell)/soon/[slug]/page.tsx uses text-bone-muted (the real token in app/globals.css is bone-mut, lines 30 and 60), so the descriptor line and blurb silently inherit the wrong color instead of the muted bone. The CTA uses raw bg-gold hover:bg-gold-deep instead of the btn-gold forged-gradient class the brand mandates (flat gold is explicitly banned in the follow-up brief line 17), and the card lacks the glass container, Chapter chip and layout the 8A spec describes.
**Recommendation:** Swap to text-bone-mut, btn-gold and the glass card pattern used everywhere else; add the Chapter II chip.

### 22. [MEDIUM/performance] Landing is fully client-rendered with always-running blurred animations `app/page.tsx`
app/page.tsx is one use client component, so the marketing page pays for framer-motion hydration and cannot export its own metadata; hero copy ships with initial opacity 0 inline styles until JS runs. Ten aurora crest nodes animate two infinite keyframe tracks with will-change transform/opacity (app/globals.css lines 304-309) even when scrolled offscreen, on top of backdrop-blur glass, which is a sustained compositor cost on low-end mobiles. Reduced-motion is handled, but normal users get the full cost for the whole visit.
**Recommendation:** Split the page: server component shell with metadata plus small client islands for motion; pause aurora animations offscreen via IntersectionObserver or animation-play-state, and cap simultaneous animated crests on small viewports.

### 23. [MEDIUM/ux] Root metadata sells serious DeFi investors, the opposite of the fun-first brief `app/layout.tsx`
app/layout.tsx line 20 describes the product as The creator-first on-chain platform for serious DeFi investors. The follow-up brief line 11 is emphatic: fun-first SocialFi, not a crypto app, trading is never the vibe. This description is what search results, link unfurls and app stores will show.
**Recommendation:** Rewrite to the fun-first positioning, e.g. A medieval social realm where wit wins glory: post, duel, swear to a House and rule your realm.

### 24. [LOW/bug] House member_count incremented with a non-atomic read-then-write `app/api/onboard/route.ts`
app/api/onboard/route.ts lines 62-71 select member_count then update member_count + 1 in JS. Concurrent onboardings to the same house lose increments, so the houses page and standings drift from house_members reality over time.
**Recommendation:** Use a Postgres RPC or trigger on house_members insert to increment atomically, or compute counts from house_members.

### 25. [LOW/ux] Terms and Privacy links point at the Chronicle, which contains neither `app/signin/page.tsx`
app/signin/page.tsx lines 90-98 link Terms and Privacy Policy to /chronicle, but lib/data/chronicle.ts has no terms or privacy sections. Users consent to documents that do not exist, which is both a UX dead end and a legal exposure at launch.
**Recommendation:** Add real Terms and Privacy sections (or dedicated pages) and deep-link them with anchors.

### 26. [LOW/ux] Post share button gives no feedback and fails silently `components/social/post-card.tsx`
components/social/post-card.tsx share() (lines 143-150) copies the URL and swallows any clipboard error with no visual response; the button label stays Copy link. The banners page already implements a Copied state (lines 56-58), so the pattern exists but is inconsistent.
**Recommendation:** Mirror the banners page Copied state, and fall back to navigator.share on mobile.

### 27. [LOW/polish] Right rail is a static placeholder that admits it is empty `components/shell/right-rail.tsx`
components/shell/right-rail.tsx hardcodes Trending ravens, courts in session and House movements appear here once the realm opens. Trending data already exists for the explore page, and quests/season standings exist for the throne page, so the most valuable persistent surface on desktop shows apology copy on every screen.
**Recommendation:** Render real trending cashtags, an active quest tracker with progress, and a season countdown with the leading House, all from existing endpoints.

### 28. [IDEA/idea] Live realm stats on the landing hero as social proof `app/page.tsx`
Brief 8B wants the landing epic and alive, and the audit shows zero social proof. Real aggregates already exist in Supabase: citizens sworn, House standings, glory issued today, live courts in session.
**Recommendation:** Add a server-rendered stat strip under the hero (cached 60s) plus a ticker of recent public deeds, honoring the real-data-only principle with honest zeros pre-launch.

### 29. [IDEA/idea] Dynamic OG cards for posts, keeps and crest unlocks via next/og `app/(shell)/post/[id]/page.tsx`
Every share currently unfurls as a blank generic card. next/og can render obsidian-and-gold cards at the edge with no external assets: post text plus author plus House crest plus Call verdict for posts, tier plus crests for keeps, and a crest-unlocked card users will want to post to X.
**Recommendation:** Add opengraph-image routes for post/[id], u/[handle] and a shareable crest-earned page; pair with a share-to-X intent to close the growth loop.

### 30. [IDEA/idea] Streak flame plus expiry nudges as the retention spine `components/shell/top-bar.tsx`
Once streak tracking exists (see the streak finding), surface a flame counter with days in the top bar, an Unbroken Vigil progress bar on home, and send your streak dies in N hours nudges through the email/Telegram channels the brief already budgets for. Tie the Lord of Light crest to real milestones (7/30/100 days).
**Recommendation:** Ship the counter with the streak backend, and gate nudges behind the per-type notification prefs once those are server-side.
