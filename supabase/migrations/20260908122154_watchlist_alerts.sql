-- Price/percent-move alerts on a member's watched coins (public.watchlist_items).
--
-- Extends the existing watchlist row rather than a new table: an alert only
-- ever exists on a coin the member has already starred, the same lifecycle,
-- so there is nothing to orphan and nothing that needs its own foreign key.
-- All three columns are nullable because "no alert armed" is the common case
-- and is expressed as null rather than a sentinel value.
--
--   alert_pct             the armed threshold, e.g. 10 means notify on a move
--                          of 10% or more in either direction from the
--                          baseline.
--   alert_baseline_price  the real price read from the market at the moment
--                          the alert was armed (or last re-armed), the "from
--                          where it is now" the member arms against.
--   alert_fired_at         when this alert last notified. Recorded for the
--                          record; the re-arm rule below is what actually
--                          prevents the same crossing firing on every poll.
--
-- RE-ARM RULE, chosen and documented rather than left to whoever reads this
-- next: on firing, GET /api/watchlist/alerts/check REBASES the alert. It sets
-- alert_baseline_price to the price that just crossed the band and keeps
-- alert_pct armed, rather than disarming it. A member who arms "tell me if
-- this moves 10%" is asking for an ongoing swing tracker on a coin they
-- already starred, not a one-shot trigger that goes silent after the first
-- move; disarming would mean the alert quietly stops watching the moment it
-- has done anything, which is the opposite of what arming it expressed. The
-- rebase itself is what stops an immediate re-fire on the next poll (the new
-- baseline IS the price that just crossed, so the move from it starts back at
-- 0%), so alert_fired_at is not load bearing for that guard; it is kept as an
-- honest "last notified" record a member-facing surface can read later.
alter table public.watchlist_items
  add column if not exists alert_pct numeric null,
  add column if not exists alert_baseline_price numeric null,
  add column if not exists alert_fired_at timestamptz null;

alter table public.watchlist_items
  add constraint watchlist_items_alert_pct_range
  check (alert_pct is null or (alert_pct >= 1 and alert_pct <= 90));

-- A row with a threshold but no baseline (or vice versa) is not a state the
-- app ever writes; the constraint says so rather than leaving it implicit.
alter table public.watchlist_items
  add constraint watchlist_items_alert_consistent
  check (
    (alert_pct is null and alert_baseline_price is null)
    or (alert_pct is not null and alert_baseline_price is not null)
  );

-- Read pattern for GET /api/watchlist/alerts/check: a member's own armed
-- alerts. Partial index, since alert_pct is null for the vast majority of
-- rows (most members never arm one).
create index if not exists watchlist_items_armed_alerts_idx
  on public.watchlist_items (profile_id)
  where alert_pct is not null;
