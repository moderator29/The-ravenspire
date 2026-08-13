-- Idempotency for the two periodic feed producers.
--
-- WHY
-- standings.snapshot and discussion.trending are both derived rather than
-- caused. Nothing in the product "does" them; a scheduled job looks at what is
-- already stored and writes one row describing a period. That makes them the
-- first kinds on the spine whose producer runs more often than the card should
-- appear: the House recompute runs daily and the standings card is weekly, and
-- the trending job runs daily and must write one card for the day however many
-- times it is invoked.
--
-- Both carry a period in subject_id ('standings:4:2026-W33', 'trending:
-- 2026-08-12'), so the existing once-only index is exactly the right guard and
-- only its kind list needs to grow. Doing it here rather than with a select
-- then insert in TypeScript matters for the same reason it mattered for the
-- original seven: a re-run of a cron that overlaps itself races a guard written
-- in application code, and does not race a unique index.
--
-- clash.opened is deliberately NOT added. A Clash is authored, not derived, and
-- the stewards may legitimately call two Clashes on the same token in different
-- weeks. Its natural key is the clash row itself, which is unique already.

drop index if exists public.realm_events_once_idx;

create unique index if not exists realm_events_once_idx
  on public.realm_events (kind, subject_id, coalesce(actor_id::text, ''::text))
  where subject_id is not null
    and kind = any (array[
      'call.sealed'::text,
      'call.resolved'::text,
      'crest.earned'::text,
      'duel.opened'::text,
      'quest.completed'::text,
      'oath.sworn'::text,
      'season.milestone'::text,
      'standings.snapshot'::text,
      'discussion.trending'::text
    ]);
